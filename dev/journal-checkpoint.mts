#!/usr/bin/env node
import { fileURLToPath } from 'node:url'

import { resolvePreToolUseRuntime } from './codex-hooks/hook-payload.mts'
import {
  hookSessionId,
  isCompactRestart,
  readHookPayload,
} from './journal-checkpoint/checkpoints.mts'

// SessionStart(compact) hook that appends a dev/blackboard-journal.mts entry at the
// post-compaction checkpoint. The PostToolUse (tool) checkpoint runs separately, in-process
// from dev/codex-hooks/post-tool-use-command.mts via runToolCheckpoint in
// dev/journal-checkpoint/tool.mts; this file has no `tool` mode.
// Always exits 0 with empty stdout on every path, including a thrown error — this hook must never
// block a session, inject unwanted context, or add visible latency. Payload parsing and the cheap
// session-id pre-filter happen here so a non-matching invocation (a regular session start, or any
// hook call with no session id) never pays the cost of importing the blackboard client or
// transcript-parsing modules. See dev/reference-agent-session-hooks.md.
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function main(): Promise<void> {
  const mode = process.argv[2]
  if (mode !== 'compact') return

  const raw = await readStdin()
  const payload = readHookPayload(raw)
  if (hookSessionId(payload) === '') return
  if (!isCompactRestart(payload)) return

  const runtime = resolvePreToolUseRuntime(process.argv[3])
  const { runCompactCheckpoint } = await import('./journal-checkpoint/compact.mts')
  await runCompactCheckpoint(payload, process.env, {}, runtime)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Fail-open: a checkpoint miss must never surface as hook noise or a nonzero exit.
  })
}
