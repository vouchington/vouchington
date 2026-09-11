import { isGitPushInvocation, isNoMistakesInvocation } from './command-match.mts'

export type TokenTotals = {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export type TranscriptFacts = {
  userPrompts: number
  assistantResponses: number
  toolCalls: number
  failedToolCalls: number
  noMistakesInvocations: number
  advisorCalls: number
  // Counts every attempted `git push` invocation, not verified remote updates — a push
  // that fails or is rejected still increments this. `dev/retrospective-facts` (bash)
  // derives the reflog-verified update count separately; see fact-contracts.md.
  pushCommandAttempts: number
  compactions: number
  tokens: TokenTotals
  subagentToolCalls: number
  subagentTokens: TokenTotals
}

export type ParsedLine = Record<string, unknown>

export type CodexOwnedSegment = {
  lines: string[]
  baseline: TokenTotals
}

export function emptyTokens(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
}

export function createEmptyFacts(): TranscriptFacts {
  return {
    userPrompts: 0,
    assistantResponses: 0,
    toolCalls: 0,
    failedToolCalls: 0,
    noMistakesInvocations: 0,
    advisorCalls: 0,
    pushCommandAttempts: 0,
    compactions: 0,
    tokens: emptyTokens(),
    subagentToolCalls: 0,
    subagentTokens: emptyTokens(),
  }
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function parseLines(lines: string[]): ParsedLine[] {
  const records: ParsedLine[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const record = asRecord(JSON.parse(line))
      if (record) records.push(record)
    } catch {
      // A partially written final line must not hide the valid records before it.
    }
  }
  return records
}

export function applyCommand(command: string, facts: TranscriptFacts): void {
  if (isNoMistakesInvocation(command)) facts.noMistakesInvocations++
  if (isGitPushInvocation(command)) facts.pushCommandAttempts++
}
