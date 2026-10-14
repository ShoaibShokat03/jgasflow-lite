/**
 * JGasFlow console AI assistant (`/api/platform/ai/*`).
 *
 * The engine in ../engine is domain-neutral; this file is the host: the
 * platform tools, the personas, the instructions and the HTTP surface. It is
 * read-only and answers only within the console modules the admin may open.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  Module,
  OnApplicationBootstrap,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Db } from '../../db/db.service';
import { parse, z } from '../../common/util';
import { AdminPerm, AuthUser, CurrentUser, SuperAdmin } from '../../auth/auth.decorators';
import { adminCan, parsePerms } from '../../platform/admin-modules';
import { PlatformModule } from '../../platform/platform.module';
import { AiAgentModule } from '../engine/ai-agent.module';
import { AgentRunner } from '../engine/agent-runner.service';
import { AgentAuditService } from '../engine/agent-audit.service';
import { ToolRegistry } from '../engine/tool-registry.service';
import { ConversationStore, publicTurns } from '../engine/conversation.store';
import { AgentOwner, AgentPrincipal, LlmClient } from '../engine/agent.types';
import { LLM_CLIENT } from '../engine/llm/llm.token';
import { AiSettingsService } from '../engine/ai-settings.service';
import { LiveBridgeService } from '../engine/live/live-bridge.service';
import { languageRule } from '../engine/prompt-builder';
import { devanagariToUrdu } from '../engine/urdu-script';
import { VoiceClient, VoiceError } from '../engine/voice/voice.client';
import { PlatformTools } from './platform-tools';
import { PERSONAS, personaByKey, personaSummaries, speakerRules } from './personas';

const SCOPE = 'platform' as const;
const ownerOf = (id: number): AgentOwner => ({ scope: SCOPE, company_id: null, user_id: id });

const PLATFORM_INSTRUCTIONS = `You are the assistant inside the JGasFlow admin console. JGasFlow is software for LPG gas cylinder shops and distributors in Pakistan, sold as a monthly subscription, with a web app and an Android app that works online or offline. You are talking to the people who run the JGasFlow platform, not to a shop.

WHAT THE RECORDS MEAN
- A "shop" is a paying business (a tenant). It has an owner and staff logins (owner, manager, salesman) and may have phones syncing.
- Subscription: every shop starts on a free trial, then pays monthly for a plan (Basic or Pro) by bank transfer, sending screenshots of the transfer as proof. Status: active, expired (read-only: can view and export, cannot add records) or suspended (locked out).
- Payments in this console are what shops pay JGasFlow for their plan. A shop's SALES are the gas it sells to its own customers; they show how much the shop uses JGasFlow. Never mix the two, and say which you mean.
- Usage: active = used in the last 2 days, low = within 7, idle = within 30, dormant = more than 30 days, never = never used.
- Money is in Pakistani Rupees (PKR). MRR = monthly price of every active paid shop added up.

HOW TO ANSWER
- Lead with the number or the name. "Three payments are waiting: ..." beats a paragraph of preamble.
- Your reply is rendered as markdown. More than one fact per row is a pipe TABLE with a header row; a plain list of names is a bullet list; headline figures are a two-column table of label and value. Keep tables to three or four columns.
- One or two facts are just a sentence. Use **bold** for the figure that answers the question.
- Name shops, not ids. Ids are for your own tool calls.
- When something looks like a problem (a dormant shop on a paid plan, a payment waiting for days, a trial that never sold anything) say so and name the console screen that fixes it: Shops, Payments, Plans, Reports, Activity or Settings.

LANGUAGE
- Answer in the language you were asked in. English in, English out. Urdu in, Urdu out. Roman Urdu in, Roman Urdu out. Mixed in, mixed out.
- The Urdu here is URDU, not Hindi. Written Urdu uses the Urdu (Perso-Arabic) script, never Devanagari.
- Shop names, plan names, references and figures stay exactly as the tool returned them.

WHAT YOU CANNOT DO
- You are READ-ONLY. You cannot approve or reject a payment, extend or change a plan, suspend a shop, reset a password or edit anything. If asked, say so and name the screen.
- You cannot see a shop's customers by name, their udhaar ledgers or individual bills; you see platform-level counts and totals only.`;

// ─────────────────────────── service ───────────────────────────

@Injectable()
export class PlatformAgentService implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly runner: AgentRunner,
    private readonly conversations: ConversationStore,
    private readonly audit: AgentAuditService,
    private readonly tools: PlatformTools,
    private readonly settings: AiSettingsService,
    private readonly live: LiveBridgeService,
    private readonly db: Db,
    private readonly httpRef: HttpAdapterHost,
  ) {}

  onModuleInit(): void {
    this.registry.registerReads(SCOPE, this.tools.reads());
    this.registry.registerWrites(SCOPE, this.tools.writes());
    const registered = new Set(this.registry.forScope(SCOPE, new Set<string>()).map((t) => t.name));
    for (const p of PERSONAS) {
      const missing = p.tools.filter((n) => !registered.has(n));
      if (missing.length) throw new Error(`Persona "${p.key}" lists tools that are not registered: ${missing.join(', ')}`);
    }
  }

  onApplicationBootstrap(): void {
    const server = this.httpRef.httpAdapter?.getHttpServer?.();
    if (server) this.live.attach(server, this.liveContext);
  }

  principal(u: Pick<AuthUser, 'id' | 'name' | 'role' | 'isSuper' | 'adminPerms'>): AgentPrincipal {
    return {
      id: u.id,
      tenant_id: null,
      display_name: u.name,
      role: u.role,
      permissions: u.adminPerms ?? ['*'],
      allows: (perm: string) => adminCan(u, perm),
    };
  }

  toolsFor(u: AuthUser | AgentPrincipal, personaKey?: string) {
    const allowed = new Set<string>(personaByKey(personaKey).tools);
    return this.registry.forScope(SCOPE, new Set<string>()).filter((t) => allowed.has(t.name));
  }

  private instructions(personaKey: string | undefined, language: string | undefined) {
    const persona = personaByKey(personaKey);
    return { persona, text: `${PLATFORM_INSTRUCTIONS}\n\n---\n\n${languageRule(language)}\n\n${speakerRules(persona)}\n\nWHO YOU ARE\n${persona.instructions}` };
  }

  /** Re-reads the admin for every live session: access revoked mid-session must bite. */
  liveContext = async (ticket: { user_id: number; persona?: string; language?: string }) => {
    const row = await this.db.one<any>('SELECT id, name, role, is_super, admin_perms, active FROM users WHERE id = ?', [ticket.user_id]).catch(() => null);
    if (!row || !row.active || !row.is_super) return null;
    const u = { id: row.id, name: row.name, role: row.role, isSuper: true, adminPerms: parsePerms(row.admin_perms) };
    if (!adminCan(u, 'assistant')) return null;
    const { persona, text } = this.instructions(ticket.persona, ticket.language);
    return {
      principal: this.principal(u),
      owner: ownerOf(row.id),
      tools: this.toolsFor(this.principal(u), persona.key),
      policies: [],
      instructions:
        `${text}\n\nSPEAKING ALOUD\nYou are in a spoken conversation. Keep answers to a few sentences.\n` +
        `- A long list is spoken as a count and two or three examples, then an offer to show the rest on screen.\n` +
        `- Never read out a table, an id or a long reference. Say what it shows.\n` +
        `- Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
        `WORKING THE SCREEN\nYou can work the screen with control_screen: clear the log, hide the cards, or change the conversation language. When asked, do it rather than describing a button.\n\n` +
        `PICKING UP A CONVERSATION\nWhen you are given what has been said so far, carry on from it and answer the question in front of you in your first sentence. Do not introduce yourself unless asked.\n\n` +
        `HANDING OVER\nA handover is the admin's choice. When they ask for a colleague by name or role, call switch_agent and pass their question along.`,
      label: `${persona.name} (${persona.role})`,
      voice: persona.live_voice,
      colleagues: PERSONAS.filter((p) => p.key !== persona.key).map((p) => ({ key: p.key, name: p.name, role: p.role })),
    };
  };

  async ask(u: AuthUser, b: { question: string; conversation_id?: number; persona?: string; language?: string; approve?: string[] }) {
    if (!this.runner.isConfigured()) throw new ServiceUnavailableException('The AI assistant is not set up yet. Add the Gemini API key in AI settings.');
    const principal = this.principal(u);
    const owner = ownerOf(u.id);
    const conversation = b.conversation_id ? await this.conversations.findOne(owner, b.conversation_id) : await this.conversations.create(owner, b.question);
    const { persona, text } = this.instructions(b.persona, b.language);
    const result = await this.runner.run({
      question: b.question,
      principal,
      history: conversation.turns ?? [],
      tools: this.toolsFor(principal, persona.key),
      policies: [],
      instructions: text,
      facts: {
        today: new Date().toISOString().slice(0, 10),
        asked_by: `${principal.display_name} (${principal.role})`,
        panel: 'JGasFlow admin console',
        speaking_as: `${persona.name}, ${persona.role}`,
        currency: 'PKR',
      },
      approved_tokens: b.approve ?? [],
      conversation_ref: `p:v${conversation.id}`,
    });
    await Promise.all([
      this.conversations.save(conversation, result.turns),
      this.audit.record({ owner, user_name: principal.display_name, conversation_id: conversation.id, question: b.question, result }),
    ]);
    return {
      conversation_id: conversation.id,
      persona: persona.key,
      answer: devanagariToUrdu(result.answer),
      status: result.stop,
      awaiting_confirmation: result.awaiting_confirmation.map((c) => ({ token: c.token, tool: c.tool, preview: c.preview })),
      used_tools: [...new Set(result.tool_log.map((t) => t.name))],
      meta: { model: result.model, turns: result.turns_used, tokens: result.usage.total_tokens, ms: result.duration_ms },
    };
  }

  capabilities(u: AuthUser) {
    const principal = this.principal(u);
    return {
      configured: this.runner.isConfigured(),
      model: this.runner.model,
      read_only: true,
      voice_enabled: this.settings.snapshot().voice_enabled,
      live_enabled: this.live.isEnabled(),
      personas: personaSummaries(),
      tools: this.toolsFor(principal, PERSONAS[0].key).map((t) => ({ name: t.name, description: t.description, writes: t.writes, permission: t.permission ?? null, allowed: !t.permission || principal.allows(t.permission) })),
    };
  }
}

// ─────────────────────────── controller ───────────────────────────

const zAsk = z.object({
  question: z.string().trim().min(2).max(2000),
  conversation_id: z.coerce.number().int().min(1).optional(),
  persona: z.string().max(32).optional(),
  language: z.string().max(8).optional(),
  approve: z.array(z.string().max(200)).max(5).optional(),
});

@SuperAdmin()
@AdminPerm('assistant')
@Controller('platform/ai')
export class PlatformAiController {
  constructor(
    private readonly svc: PlatformAgentService,
    private readonly conversations: ConversationStore,
    private readonly audit: AgentAuditService,
    private readonly settings: AiSettingsService,
    private readonly voice: VoiceClient,
    private readonly live: LiveBridgeService,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  @Get('capabilities')
  capabilities(@CurrentUser() u: AuthUser) {
    return this.svc.capabilities(u);
  }

  @Get('personas')
  personas() {
    return PERSONAS.map((p) => ({ key: p.key, name: p.name, role: p.role, gender: p.gender, greeting: p.greeting, accent: p.accent, tagline: p.tagline, icon: p.icon, briefing: p.briefing, tool_count: p.tools.length }));
  }

  /** Every call costs real money at the provider, hence the tighter limit. */
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @HttpCode(200)
  @Post('ask')
  ask(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.svc.ask(u, parse(zAsk, body));
  }

  @Get('conversations')
  list(@CurrentUser() u: AuthUser) {
    return this.conversations.list(ownerOf(u.id));
  }

  @Get('conversations/:id')
  async one(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const row = await this.conversations.findOne(ownerOf(u.id), id);
    return { id: row.id, title: row.title, created_at: row.created_at, messages: publicTurns(row.turns) };
  }

  @Delete('conversations/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.conversations.remove(ownerOf(u.id), id);
  }

  /** Audit: AI settings admins see everyone's questions; others only their own. */
  @Get('runs')
  runs(@CurrentUser() u: AuthUser, @Query() q: any) {
    return this.audit.list(SCOPE, null, q, adminCan(u, 'ai_settings') ? undefined : u.id);
  }

  @AdminPerm('ai_settings')
  @Get('tool-usage')
  toolUsage(@Query('days') days?: string) {
    return this.audit.toolUsage(SCOPE, null, Math.min(Math.max(Number(days) || 30, 1), 365));
  }

  // ── voice

  @Throttle({ default: { limit: 40, ttl: 60000 } })
  @HttpCode(200)
  @Post('voice/transcribe')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    try {
      const out = await this.voice.transcribe(file as any);
      return { ...out, text: devanagariToUrdu(out?.text ?? '') };
    } catch (err) {
      throw asHttp(err);
    }
  }

  @Throttle({ default: { limit: 40, ttl: 60000 } })
  @HttpCode(200)
  @Post('voice/speak')
  async speak(@Body() body: unknown, @Res() res: Response) {
    const b = parse(z.object({ text: z.string().min(1).max(8000), persona: z.string().max(32).optional() }), body);
    try {
      const r = await this.voice.synthesize(b.text, { voice: personaByKey(b.persona).voice || undefined });
      res.setHeader('Content-Type', r.content_type);
      res.setHeader('Content-Length', String(r.audio.length));
      res.send(r.audio);
    } catch (err) {
      throw asHttp(err);
    }
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  @Post('live/ticket')
  ticket(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    if (!this.live.isEnabled()) throw new ServiceUnavailableException('Live voice is not switched on in AI settings.');
    const b = parse(z.object({ persona: z.string().max(32).optional(), language: z.string().max(8).optional() }), body);
    return { ticket: this.live.mintTicket({ user_id: u.id, scope: SCOPE, persona: b.persona, language: b.language }), path: '/ws/ai/live', model: this.live.liveModel() };
  }

  // ── settings (key is write-only: never returned, only a mask)

  @AdminPerm('ai_settings')
  @Get('settings')
  view() {
    return this.settings.view();
  }

  @AdminPerm('ai_settings')
  @Patch('settings')
  update(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const b = parse(
      z.object({
        api_key: z.string().max(400).optional(),
        model: z.string().max(100).optional(),
        max_output_tokens: z.coerce.number().int().min(256).max(32000).optional(),
        thinking_budget: z.coerce.number().int().min(0).max(32000).nullable().optional(),
        voice_enabled: z.boolean().optional(),
        voice_api_key: z.string().max(400).optional(),
        voice_name: z.string().max(100).optional(),
        voice_speed: z.coerce.number().min(0.5).max(2).optional(),
        live_enabled: z.boolean().optional(),
        live_model: z.string().max(100).optional(),
      }),
      body,
    );
    return this.settings.update({ ...b, actor_id: u.id, actor_name: u.name });
  }

  @AdminPerm('ai_settings')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('settings/models')
  models(@Query('api_key') apiKey?: string) {
    return this.llm.listModels ? this.llm.listModels(apiKey) : [];
  }

  @AdminPerm('ai_settings')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('settings/test')
  test(@Body() body: unknown) {
    const b = parse(z.object({ api_key: z.string().max(400).optional(), model: z.string().max(100).optional() }), body);
    if (!this.llm.verify) return { ok: false, model: '', latency_ms: 0, error: 'This provider cannot be tested.' };
    return this.llm.verify(b.api_key, b.model);
  }

  @AdminPerm('ai_settings')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('settings/voices')
  async voices(@Query('api_key') apiKey?: string) {
    try {
      return await this.voice.listVoices(apiKey);
    } catch (err) {
      throw asHttp(err);
    }
  }

  @AdminPerm('ai_settings')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('settings/voice-test')
  voiceTest(@Body() body: unknown) {
    return this.voice.verify(parse(z.object({ api_key: z.string().max(400).optional() }), body).api_key);
  }
}

function asHttp(err: unknown): HttpException {
  if (err instanceof VoiceError) return new HttpException(err.message, (err as any).status ?? 502);
  return new HttpException('The voice service failed.', 502);
}

@Module({
  imports: [AiAgentModule, PlatformModule],
  controllers: [PlatformAiController],
  providers: [PlatformAgentService, PlatformTools],
})
export class PlatformAiModule {}
