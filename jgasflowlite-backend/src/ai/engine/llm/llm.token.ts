/**
 * Injection token for the LLM adapter.
 *
 * The engine depends on the LlmClient interface, never on a concrete provider,
 * so swapping Gemini for another model is one line in ai-agent.module.ts.
 */
export const LLM_CLIENT = 'AGENT_LLM_CLIENT';
