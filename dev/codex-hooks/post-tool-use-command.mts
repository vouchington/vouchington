#!/usr/bin/env node

import { readHookPayload } from './hook-payload.mts'
import type { HookPayload } from './types.mts'

// Merged PostToolUse entrypoint: reads stdin and parses the payload exactly once, then runs the
// tmux reminder in-process instead of Codex/Claude spawning separate hook processes for the same
// tool call (see docs/development on the reveal-delay investigation this replaced —
// docs/development/local-development/reference-agent-session-hooks.md). The reminder may write
// stdout, at most once, at the very end, and must never block the calling tool. Hooks never record
// session evidence or append Blackboard journal entries: agents write their own. The import stays
// lazy and behind its own try/catch so a non-matching call still pays only one stdin read plus one
// parse.
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

// Returns only once the write callback fires, i.e. once the data has been handed off to the
// underlying stream in full. process.stdout is a pipe to the hook harness here, and a forced
// process.exit() does not flush pending async I/O — awaiting this before main() resolves is what
// makes the reminder JSON survive under pipe backpressure instead of being silently truncated.
function emitReminder(message: string): Promise<void> {
  return new Promise(resolve => {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: { additionalContext: message, hookEventName: 'PostToolUse' },
      })}\n`,
      () => resolve(),
    )
  })
}

async function renderReminder(payload: HookPayload): Promise<string | null> {
  try {
    const { renderPostToolReminder } = await import('../tmux-reminder-post-tool.mts')
    return renderPostToolReminder(payload)
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const raw = await readStdin()
  const payload = readHookPayload(raw)
  const reminder = await renderReminder(payload)

  if (reminder) await emitReminder(reminder)
}

if (import.meta.main) {
  main()
    .catch(() => {
      // Fail-open: nothing here may block, delay, or crash the calling tool.
    })
    .finally(() => process.exit(0))
}
