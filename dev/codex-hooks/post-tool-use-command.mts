#!/usr/bin/env node
import { fileURLToPath } from 'node:url'

import { hookSessionId, readHookPayload, resolvePreToolUseRuntime } from './hook-payload.mts'
import type { HookPayload } from './types.mts'

// Merged PostToolUse entrypoint: reads stdin and parses the payload exactly once, then runs every
// PostToolUse side effect in-process instead of Codex/Claude spawning three separate hook
// processes for the same tool call (see docs/development on the reveal-delay investigation this
// replaced — dev/reference-agent-session-hooks.md). Only the tmux reminder may write stdout, and
// it writes at most once, at the very end; the journal checkpoint and session-friction logging are
// fire-and-forget side effects that must never surface as hook output or block the calling tool.
// Each stays behind its own try/catch so one failing step never skips the others, and each import
// stays lazy so a non-matching call still pays only one stdin read plus one parse.
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
  const tmuxPane = process.env.TMUX_PANE ?? ''
  if (tmuxPane === '') return null
  try {
    const { renderPostToolReminder } = await import('../tmux-reminder-post-tool.mts')
    return renderPostToolReminder(payload, tmuxPane)
  } catch {
    return null
  }
}

async function runJournalCheckpoint(
  payload: HookPayload,
  runtime: ReturnType<typeof resolvePreToolUseRuntime>,
): Promise<void> {
  if (hookSessionId(payload) === '') return
  try {
    const { runToolCheckpoint } = await import('../journal-checkpoint/tool.mts')
    await runToolCheckpoint(payload, process.env, {}, runtime)
  } catch {
    // Fail-open: a checkpoint miss must never surface as hook noise or a nonzero exit.
  }
}

async function runFrictionRecorder(payload: HookPayload): Promise<void> {
  try {
    const { recordFriction } = await import('../session-friction/record.mts')
    recordFriction(payload, process.env)
  } catch {
    // Fail-open, same contract as the standalone hook this replaced.
  }
}

async function main(): Promise<void> {
  const runtime = resolvePreToolUseRuntime(process.argv[2])
  const raw = await readStdin()
  const payload = readHookPayload(raw)

  // Each side effect is independent (own resource, own try/catch, no shared return value), so run
  // them concurrently instead of paying their combined latency sequentially.
  const [reminder] = await Promise.all([
    renderReminder(payload),
    runJournalCheckpoint(payload, runtime),
    runFrictionRecorder(payload),
  ])

  if (reminder) await emitReminder(reminder)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .catch(() => {
      // Fail-open: nothing here may block, delay, or crash the calling tool.
    })
    .finally(() => process.exit(0))
}
