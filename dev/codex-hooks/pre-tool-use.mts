// PreToolUse hook entrypoint shared by Claude Code, Codex, Cursor and Grok.
//
// Runtime and payload dialects: each harness config appends an argv runtime token (`claude` from
// .claude/settings.json, `codex` from .codex/config.toml). Cursor and Grok also run the Claude
// config, so they are detected first from their own env/payload markers (hook-payload.mts,
// cursor-payload.mts). Cursor names its shell tool `Shell` and reports `tool_output`; that is
// normalized to Claude's `Bash` + `tool_response` shape when the payload is read, so policy sees
// one dialect.
//
// Working directory: the worktree root comes from this script's own location, never from the Bash
// tool call's cwd, so a `cd` earlier in the session cannot change which checkout the policy judges.
//
import * as path from 'node:path'

import { isAttendedClaudeSession, isAutomationContext, preToolUseOutput } from './policy.mts'
import { readHookPayload, resolvePreToolUseRuntime } from './hook-payload.mts'

// This script's own location is a stable worktree anchor, independent of the Bash tool call's
// cwd (which can differ between merges in the same session, e.g. after a `cd`) — same
// computation post-tool-use.mts uses.
const worktreeRoot = path.resolve(import.meta.dirname, '../..')
const payload = readHookPayload()
// argv[2] is the runtime token appended by each config: `claude` (.claude/settings.json, which
// Cursor and Grok also run) or `codex` (.codex/config.toml). Cursor and Grok are detected from
// their own env/payload markers before argv `claude` is trusted.
const runtime = resolvePreToolUseRuntime(process.argv[2], process.env, payload)

const output = preToolUseOutput(payload, {
  attended: isAttendedClaudeSession(),
  automationContext: isAutomationContext(),
  runtime,
})
if (output.stdout !== '') process.stdout.write(output.stdout)
if (output.stderr !== '') process.stderr.write(output.stderr)
process.exitCode = output.exitCode
