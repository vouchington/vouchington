#!/usr/bin/env node

import { fileURLToPath } from 'node:url'

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
