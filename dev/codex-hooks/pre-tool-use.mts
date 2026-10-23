// PreToolUse hook entrypoint shared by Claude Code, Codex, Cursor and Grok.
//
// Runtime and payload dialects: each harness config appends an argv runtime token (`claude` from
// .claude/settings.json, `codex` from .codex/config.toml). Cursor and Grok also run the Claude
// config, so they are detected first from their own env/payload markers (hook-payload.mts,
// cursor-payload.mts). Cursor names its shell tool `Shell` and reports `tool_output`; that is
// normalized to Claude's `Bash` + `tool_response` shape when the payload is read, so policy sees
// one dialect.
//
import { isAttendedClaudeSession, isAutomationContext, preToolUseOutput } from './policy.mts'
import { readHookPayload, resolvePreToolUseRuntime } from './hook-payload.mts'

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
