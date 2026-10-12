/**
 * Tool registry — name → definition + handler.
 *
 * Two things here are deliberate.
 *
 * DUPLICATE NAMES ARE A BOOT FAILURE. Two tools answering to one name means the
 * model's choice silently depends on registration order, which is the kind of
 * bug that only shows up as "the assistant gave the wrong answer once".
 *
 * `writes` IS DERIVED, NEVER DECLARED. A tool that mutates state while claiming
 * `writes: false` skips both the policy vetoes and the confirmation gate, and
 * nothing in the system would report that it happened. So the flag comes from
 * WHICH METHOD registered the tool, not from a hand-written property: to make a
 * write, a tool has to be moved into `registerWrites`, which is visible in a
 * diff in a way that flipping a boolean is not.
 */

import { Injectable, Logger } from '@nestjs/common';
import { AgentScope, AgentTool, RegisteredTool } from './agent.types';

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools = new Map<string, RegisteredTool>();

  /** Read-only tools. These face the permission check and nothing else. */
  registerReads(scope: AgentScope, tools: AgentTool[]): void {
    this.add(scope, tools, false);
  }

  /** State-changing tools. These face policies and user confirmation too. */
  registerWrites(scope: AgentScope, tools: AgentTool[]): void {
    this.add(scope, tools, true);
  }

  private add(scope: AgentScope, tools: AgentTool[], writes: boolean): void {
    for (const tool of tools) {
      if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
        throw new Error(`Agent tool name must be snake_case: "${tool.name}"`);
      }
      if (this.tools.has(tool.name)) {
        throw new Error(`Duplicate agent tool name "${tool.name}"`);
      }
      if (writes && !tool.preview) {
        throw new Error(
          `Write tool "${tool.name}" must provide preview() — the user has to be ` +
            `told what they are approving.`,
        );
      }
      this.tools.set(tool.name, { ...tool, writes, scope });
    }
    this.logger.log(
      `Registered ${tools.length} ${scope} ${writes ? 'write' : 'read'} tool(s): ` +
        tools.map((t) => t.name).join(', '),
    );
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  all(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  /**
   * The tools worth declaring to the model for this run.
   *
   * SCOPE is absolute — a clinic run can never be handed a platform tool, and
   * the runner passes this same list to the guard as the `available` set, so a
   * hallucinated cross-scope name is rejected as unknown rather than executed.
   *
   * Within a scope, the filter is by FEATURE MODULE only, not by permission: a
   * module the tenant has not bought does not exist as far as the model is
   * concerned, whereas a tool the user merely lacks permission for still needs
   * to reach the guard, so the refusal can say which permission is missing.
   */
  forScope(scope: AgentScope, enabled: ReadonlySet<string>): RegisteredTool[] {
    return this.all().filter(
      (t) => t.scope === scope && (!t.module || enabled.has(t.module)),
    );
  }
}
