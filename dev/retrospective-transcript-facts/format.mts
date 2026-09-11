import type { TranscriptFacts } from './compute.mts'

export function formatTranscriptFacts(sessionId: string, facts: TranscriptFacts): string {
  return `${[
    '=== Transcript Facts ===',
    `Session: ${sessionId}`,
    `User prompts: ${facts.userPrompts}`,
    `Assistant responses: ${facts.assistantResponses}`,
    `Tool calls: ${facts.toolCalls} (failed: ${facts.failedToolCalls})`,
    `no-mistakes invocations: ${facts.noMistakesInvocations}`,
    `advisor calls: ${facts.advisorCalls}`,
    `Push commands attempted: ${facts.pushCommandAttempts}`,
    `Compactions: ${facts.compactions}`,
    `Tokens: input=${facts.tokens.input} output=${facts.tokens.output} cache_read=${facts.tokens.cacheRead} cache_creation=${facts.tokens.cacheCreation}`,
    `Subagent tool calls: ${facts.subagentToolCalls}`,
    `Subagent tokens: input=${facts.subagentTokens.input} output=${facts.subagentTokens.output} cache_read=${facts.subagentTokens.cacheRead} cache_creation=${facts.subagentTokens.cacheCreation}`,
  ].join('\n')}\n`
}

export function formatUnavailable(reason: string): string {
  return `${['=== Transcript Facts ===', `Status: unavailable (${reason})`].join('\n')}\n`
}
