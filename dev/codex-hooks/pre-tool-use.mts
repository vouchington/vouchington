import * as path from 'node:path'

import { persistGrokRealSessionId } from '../agent-session-id/persist.mts'
import { isAttendedClaudeSession, isAutomationContext, preToolUseOutput } from './policy.mts'
import { sessionHomeOwners } from './policy/github-checkout-owners.mts'
import { readHookPayload, resolvePreToolUseRuntime } from './hook-payload.mts'

// argv[2] is the runtime token appended by each config: `claude` (.claude/settings.json) or
// `codex` (.codex/config.toml). GROK_* wins even when Claude-compat still passes `claude`.
const runtime = resolvePreToolUseRuntime(process.argv[2])

// This script's own location is a stable worktree anchor, independent of the Bash tool call's
// cwd (which can differ between merges in the same session, e.g. after a `cd`) — same
// computation post-tool-use.mts uses.
const worktreeRoot = path.resolve(import.meta.dirname, '../..')
const payload = readHookPayload()
persistGrokRealSessionId(payload, process.env, worktreeRoot)

const output = preToolUseOutput(payload, {
  attended: isAttendedClaudeSession(),
  automationContext: isAutomationContext(),
  runtime,
  sessionOwners: () => sessionHomeOwners(worktreeRoot),
})
if (output !== '') {
  process.stdout.write(output)
}
