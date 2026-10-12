/**
 * The engine, wired up. Nothing in this module knows what a clinic is.
 *
 * It exports the four pieces a host application needs — the registry it puts its
 * tools into, the runner it calls, the conversation store and the audit log. The
 * guard is deliberately NOT exported: a host must not be able to reach a tool
 * handler except through the runner, because that single path is the security
 * model.
 *
 * TO CHANGE PROVIDER: point LLM_CLIENT at a different LlmClient. Nothing else in
 * the engine, and nothing at all in the host, mentions Gemini.
 */

import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { AgentAuditService } from './agent-audit.service';
import { AgentGuard } from './agent-guard.service';
import { AgentRunner } from './agent-runner.service';
import { AiSettingsService } from './ai-settings.service';
import { ConversationStore } from './conversation.store';
import { GeminiClient } from './llm/gemini.client';
import { VoiceClient } from './voice/voice.client';
import { LiveBridgeService } from './live/live-bridge.service';
import { LLM_CLIENT } from './llm/llm.token';
import { ToolRegistry } from './tool-registry.service';

@Module({
  imports: [DbModule],
  providers: [
    AiSettingsService,
    VoiceClient,
    LiveBridgeService,
    GeminiClient,
    { provide: LLM_CLIENT, useExisting: GeminiClient },
    ToolRegistry,
    AgentGuard,
    AgentRunner,
    ConversationStore,
    AgentAuditService,
  ],
  // LLM_CLIENT is exported because the settings screen needs the provider
  // directly — listing models and testing a key are provider calls, not agent
  // runs. The guard stays unexported: a host may configure the provider, but
  // must not be able to reach a tool handler except through the runner.
  exports: [
    ToolRegistry,
    AgentRunner,
    ConversationStore,
    AgentAuditService,
    AiSettingsService,
    VoiceClient,
    LiveBridgeService,
    LLM_CLIENT,
  ],
})
export class AiAgentModule {}
