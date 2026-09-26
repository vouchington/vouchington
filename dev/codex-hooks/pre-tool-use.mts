import * as path from 'node:path'

import { persistHookRealSessionId } from '../agent-session-id/persist.mts'
import { isAttendedClaudeSession, isAutomationContext, preToolUseOutput } from './policy.mts'
import { sessionHomeOwners } from './policy/github-checkout-owners.mts'
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
persistHookRealSessionId(runtime, payload, process.env, worktreeRoot)

const output = preToolUseOutput(payload, {
  attended: isAttendedClaudeSession(),
  automationContext: isAutomationContext(),
  runtime,
  sessionOwners: () => sessionHomeOwners(worktreeRoot),
})
if (output.stdout !== '') process.stdout.write(output.stdout)
if (output.stderr !== '') process.stderr.write(output.stderr)
process.exitCode = output.exitCode
