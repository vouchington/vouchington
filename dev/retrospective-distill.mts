#!/usr/bin/env node

import { runDistillClassify } from './retrospective-distill/run.mts'

const USAGE = `Usage: node dev/retrospective-distill.mts <partition-jsonl-path> \\
  --retro-cutoff <iso8601> --session-cutoff <iso8601>

Classifies each session in a local agent-blackboard snapshot partition by shape
(retrospective, entry-type-unresolved, checkpoint-only, journal-only,
zero-entry-child, zero-entry-root) and eligibility, one line per session:
"<session id>\\t<shape>\\t<eligible|not-yet-eligible>".

Read-only: pure local JSONL parsing, no MCP, network, blackboard client, or writes.
`

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE)
    return
  }
  process.stdout.write(`${await runDistillClassify(argv)}\n`)
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
