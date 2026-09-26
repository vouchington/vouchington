import { extractToolCommand, hookSessionId, readHookPayload } from '../codex-hooks/hook-payload.mts'
import type { HookPayload } from '../codex-hooks/types.mts'
import type { CheckpointKind } from './checkpoint-entry.mts'

export { extractToolCommand, hookSessionId, readHookPayload }
export type { HookPayload }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Bash tool_response shape, verified empirically from this repo's own Claude Code session
// transcripts: a completed call returns an object ({stdout, stderr, interrupted, isImage,
// noOutputExpected}) — never an exit-code field — while a failed call returns the STRING
// "Error: Exit code <n>: <output>" in tool_response's place. There is no exit-code field on
// either shape; the type plus the string prefix IS the signal.
//
// Codex's shape is now confirmed too (its shell tool builds its own hook input, bypassing the
// generic Function-call hook builders — see codex-rs/core/src/tools/context.rs:363):
// `tool_response` is a plain, truncated-output STRING with no exit code at all —
// `post_tool_use_response()` never forwards `ExecCommandToolOutput.exit_code`
// (context.rs:320, :369-377). A non-"Error: Exit code" string is Codex's merged
// stdout+stderr, recorded as `{kind: 'output'}` below. Because Codex drops the exit code before
// it ever reaches hooks, there is no way to distinguish a Codex failure from a Codex success by
// shape alone — `isFailureCandidate` (checkpoint 2) never fires for Codex, a source-verified
// limit, not an oversight. Grok's `tool_response` and Cursor's (normalized in readHookPayload) are
// objects carrying `exit_code`, so a nonzero one is a failure. `isMilestoneCandidate` (checkpoint 3) can still use `output` text, since a
// milestone already requires corroborating output content (a PR URL, a non-rejected ref-update
// line), not an exit status.
export type ToolOutcome =
  | { kind: 'failure'; message: string }
  | { kind: 'success'; stderr: string; stdout: string }
  | { kind: 'output'; text: string }
  | { kind: 'unknown' }

export function extractToolOutcome(payload: HookPayload): ToolOutcome {
  const raw = payload.tool_response ?? payload.toolResponse
  if (typeof raw === 'string') {
    return raw.startsWith('Error: Exit code')
      ? { kind: 'failure', message: raw }
      : { kind: 'output', text: raw }
  }
  if (isRecord(raw)) {
    const stderr = typeof raw.stderr === 'string' ? raw.stderr : ''
    const stdout = typeof raw.stdout === 'string' ? raw.stdout : ''
    if (typeof raw.exit_code === 'number' && raw.exit_code !== 0) {
      return { kind: 'failure', message: `Error: Exit code ${raw.exit_code}\n${stderr || stdout}` }
    }
    return { kind: 'success', stderr, stdout }
  }
  return { kind: 'unknown' }
}

export function isCompactRestart(payload: HookPayload): boolean {
  return payload.source === 'compact'
}

// Deliberately narrow: routine exploratory command failures (a typo'd ls, a probing curl) must
// never trigger a checkpoint — only the test/lint/CI-facing commands #9337 actually cares about.
const FAILURE_COMMAND_PATTERN =
  /(^|[;&|]\s*)((pnpm\s+(exec\s+)?|npx\s+)?(vitest|playwright|no-mistakes|tsgo|oxlint)\b|\bgh\s+run\b|\bpr-shepherd\b)/

export function isFailureCandidate(
  payload: HookPayload,
): { command: string; message: string } | null {
  const outcome = extractToolOutcome(payload)
  if (outcome.kind !== 'failure') return null
  const command = extractToolCommand(payload)
  if (!command || !FAILURE_COMMAND_PATTERN.test(command)) return null
  return { command, message: outcome.message }
}

const PR_CREATE_COMMAND_PATTERN = /(^|[;&|])\s*gh\s+pr\s+create(\s|$)/
const GIT_PUSH_COMMAND_PATTERN = /(^|[;&|])\s*git\s+push(\s|$)/
const DRY_RUN_PATTERN = /--dry-run\b/
const PR_URL_PATTERN = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/
const PUSH_REF_UPDATE_PATTERN = /^.*->.*$/m
const PUSH_REJECTED_PATTERN = /\b(rejected|error:)\b/i
// `gh pr create` prints a PR URL both on a genuine creation AND when a PR for the branch already
// exists ("a pull request for branch ... already exists:\n<url>") — reject the latter before the
// URL match below, same shape as PUSH_REJECTED_PATTERN for `git push`.
const PR_CREATE_ALREADY_EXISTS_PATTERN = /\balready exists\b/i

// Both milestone kinds are also valid CheckpointKind values (see checkpoint-entry.mts) — deriving
// from that union instead of re-spelling the literals keeps them from drifting apart.
export type MilestoneKind = Extract<CheckpointKind, 'pr-create' | 'push'>

// The object form of tool_response only proves the Bash call COMPLETED — a rejected
// non-fast-forward `git push` completes too. Require output corroboration in addition to the
// command match: a PR URL in stdout/stderr for `gh pr create`, or a ref-update `->` line with no
// `rejected`/`error:` wording for `git push`. Both tools write their useful output to stderr, so
// both streams are scanned. `evidence` is the matched substring, reused verbatim by note.mts so
// the journal entry quotes exactly what corroborated the milestone.
export function isMilestoneCandidate(
  payload: HookPayload,
): { command: string; evidence: string; kind: MilestoneKind } | null {
  const outcome = extractToolOutcome(payload)
  if (outcome.kind !== 'success' && outcome.kind !== 'output') return null
  const command = extractToolCommand(payload)
  if (!command || DRY_RUN_PATTERN.test(command)) return null
  const output = outcome.kind === 'success' ? `${outcome.stdout}\n${outcome.stderr}` : outcome.text

  if (PR_CREATE_COMMAND_PATTERN.test(command)) {
    if (PR_CREATE_ALREADY_EXISTS_PATTERN.test(output)) return null
    const match = PR_URL_PATTERN.exec(output)
    if (!match) return null
    return { command, evidence: match[0], kind: 'pr-create' }
  }

  if (GIT_PUSH_COMMAND_PATTERN.test(command)) {
    if (PUSH_REJECTED_PATTERN.test(output)) return null
    const match = PUSH_REF_UPDATE_PATTERN.exec(output)
    if (!match) return null
    return { command, evidence: match[0].trim(), kind: 'push' }
  }

  return null
}
