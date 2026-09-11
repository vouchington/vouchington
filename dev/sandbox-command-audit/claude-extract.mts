import { asArray, asRecord } from '../retrospective-transcript-facts/compute-shared.mts'
import type {
  ClaudeDenialRecord,
  ClaudeEscalationRecord,
  ClaudeSandboxFailureRecord,
  ClaudeToolDenialKind,
} from './types.mts'
import { isGitMetadataPermissionDenial } from './git-metadata-denial.mts'
import { recordClaudeToolUse, type ToolUseInfo } from './claude-tool-uses.mts'
import {
  appendBounded,
  emptyRawRetention,
  extractToolResultText,
  truncateRawText,
  type RawRetention,
} from './limits.mts'

const E2BIG_PATTERN = /\bE2BIG\b/

// Deliberately conservative and empirically checked against this machine's real
// transcripts (see the session that built this tool). `is_error: true` on a Bash
// tool_result also covers ordinary application-level failures (a failed test run, a
// grep with no matches, a nonzero exit code) — matching on is_error alone would flood
// the "genuine bypass candidate" bucket with noise unrelated to sandbox/permission
// friction. Only these known permission/access failure signatures count; anything
// else is silently out of scope for this tool.
// ECONNREFUSED is deliberately excluded: it's the OS's generic "nothing is listening
// on that port" error, indistinguishable from a routine app-level failure (a crashed
// dev server, a not-yet-started service) — including for `localhost` targets. Unlike
// the other patterns here, it carries no permission/access-denial semantics on its
// own, so including it would flood the genuine-bypass-candidate list with noise.
const GENUINE_FAILURE_PATTERNS = [
  /operation not permitted/i,
  /permission denied/i,
  /\bEACCES\b/,
  /\bEPERM\b/,
  /could not start .*sandbox/i,
]

// A timeout (as opposed to ECONNREFUSED) against a loopback target is this sandbox's
// signature for a silently-dropped connection — see docs/.agents/skills/retrospective/
// sandbox-audit.md's "localhost timeout" genuine-bypass source. Requiring both a
// timeout token AND a loopback-address token keeps this narrow: a bare "timed out"
// (e.g. a slow test run) or a bare loopback mention with no timeout carries no
// sandbox/access signal on its own, matching the ECONNREFUSED exclusion's reasoning.
const TIMEOUT_PATTERN = /\bETIMEDOUT\b|\btimed out\b/i
const LOOPBACK_PATTERN = /\blocalhost\b|\b127\.0\.0\.1\b|\b::1\b/i

function isLoopbackTimeout(text: string): boolean {
  return TIMEOUT_PATTERN.test(text) && LOOPBACK_PATTERN.test(text)
}

const DENIAL_KINDS: ClaudeToolDenialKind[] = [
  'user-rejected',
  'permission-rule',
  'automode-blocked',
]

function isDenialKind(value: unknown): value is ClaudeToolDenialKind {
  return typeof value === 'string' && (DENIAL_KINDS as string[]).includes(value)
}

function classifyFailureText(
  command: string | undefined,
  text: string,
): 'e2big' | 'genuine' | 'worktree-denial' | undefined {
  if (E2BIG_PATTERN.test(text)) return 'e2big'
  if (isGitMetadataPermissionDenial(command, text)) return 'worktree-denial'
  if (GENUINE_FAILURE_PATTERNS.some(pattern => pattern.test(text))) return 'genuine'
  if (isLoopbackTimeout(text)) return 'genuine'
  return undefined
}

function recordToolResult(
  record: Record<string, unknown>,
  toolUses: Map<string, ToolUseInfo>,
  denials: ClaudeDenialRecord[],
  sandboxFailures: ClaudeSandboxFailureRecord[],
  retention: RawRetention,
  pendingBytes: { value: number },
): void {
  const message = asRecord(record.message)
  const denialKind = isDenialKind(record.toolDenialKind) ? record.toolDenialKind : undefined
  for (const block of asArray(message?.content)) {
    const value = asRecord(block)
    if (!value || value.type !== 'tool_result') continue
    const toolUseId = typeof value.tool_use_id === 'string' ? value.tool_use_id : undefined
    const toolUse = toolUseId ? toolUses.get(toolUseId) : undefined
    if (toolUseId && toolUse) {
      toolUses.delete(toolUseId)
      pendingBytes.value -= toolUse.bytes
    }
    if (value.is_error !== true) continue
    if (toolUse?.name !== 'Bash') continue
    if (denialKind) {
      appendBounded(
        denials,
        { source: 'claude', kind: denialKind, command: toolUse.command },
        retention,
      )
      continue
    }
    const text = extractToolResultText(value.content)
    const kind = classifyFailureText(toolUse.command, text)
    if (kind) {
      appendBounded(
        sandboxFailures,
        {
          source: 'claude',
          kind,
          command: toolUse.command,
          errorText: truncateRawText(text, retention, 'error'),
        },
        retention,
      )
    }
  }
}

export type ClaudeExtraction = {
  escalations: ClaudeEscalationRecord[]
  denials: ClaudeDenialRecord[]
  sandboxFailures: ClaudeSandboxFailureRecord[]
  rawRetention: RawRetention
}

export type ClaudeRecordExtractor = {
  pushLine: (line: string) => void
  result: () => ClaudeExtraction
}

export function createClaudeRecordExtractor(): ClaudeRecordExtractor {
  const escalations: ClaudeEscalationRecord[] = []
  const denials: ClaudeDenialRecord[] = []
  const sandboxFailures: ClaudeSandboxFailureRecord[] = []
  const rawRetention = emptyRawRetention()
  const toolUses = new Map<string, ToolUseInfo>()
  const pendingBytes = { value: 0 }
  return {
    pushLine(line) {
      if (!line.trim()) return
      try {
        const record = asRecord(JSON.parse(line))
        if (!record) return
        if (record.type === 'assistant') {
          const message = asRecord(record.message)
          for (const block of asArray(message?.content))
            recordClaudeToolUse(block, toolUses, escalations, rawRetention, pendingBytes)
        } else if (record.type === 'user') {
          recordToolResult(record, toolUses, denials, sandboxFailures, rawRetention, pendingBytes)
        }
      } catch {
        // A partially written final line must not hide earlier records.
      }
    },
    result: () => {
      const result = { escalations, denials, sandboxFailures, rawRetention }
      // Keep existing direct-extractor consumers' enumerable JSON contract stable; the
      // scanner reads this internal accounting field to surface bounded retention.
      Object.defineProperty(result, 'rawRetention', { enumerable: false, value: rawRetention })
      return result
    },
  }
}

// tool_use blocks always precede their tool_result in file order, so a single forward
// pass building `toolUses` as it goes is enough to correlate every result/denial back
// to its originating command — no second pass needed.
export function extractClaudeRecords(lines: string[]): ClaudeExtraction {
  const extractor = createClaudeRecordExtractor()
  for (const line of lines) extractor.pushLine(line)
  return extractor.result()
}
