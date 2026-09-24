#!/usr/bin/env node

import { fileURLToPath } from 'node:url'

import { BlackboardJournalError, runAppend } from './blackboard-journal/append.mts'
import { runEntries } from './blackboard-journal/entries.mts'

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
  stream.write(
    'Usage: node dev/blackboard-journal.mts append --file <path> ' +
      '[--session-id <id>] [--parent-session-id <id>] [--agent <name>] ' +
      '[--version <version>] [--timestamp <iso8601>] [--repository <owner/name> ...]\n' +
      '       node dev/blackboard-journal.mts append --file <path> ' +
      '--root-codex [--new-root-codex-session] [--agent codex] ' +
      '[--version <version>] [--timestamp <iso8601>] [--repository <owner/name> ...]\n' +
      '       node dev/blackboard-journal.mts entries [--session-id <id> | --root-codex [--new-root-codex-session]]\n' +
      'Note: entries --root-codex refreshes the worktree-local root identity before reading the server.\n',
  )
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

// Only printable when the failure carried a noteFile (i.e. it happened after arg
// parsing succeeded) — plain arg-parsing errors have no meaningful replay command.
function printReplayCommand(error: BlackboardJournalError): void {
  if (!error.noteFile) return
  const parts = [
    'node',
    'dev/blackboard-journal.mts',
    'append',
    '--file',
    shellQuote(error.noteFile),
  ]
  if (error.sessionIdArg) parts.push('--session-id', shellQuote(error.sessionIdArg))
  if (error.parentSessionId) parts.push('--parent-session-id', shellQuote(error.parentSessionId))
  if (error.agent) parts.push('--agent', shellQuote(error.agent))
  if (error.rootCodex) parts.push('--root-codex')
  if (error.newRootCodexSession) parts.push('--new-root-codex-session')
  if (error.version) parts.push('--version', shellQuote(error.version))
  if (error.timestamp) parts.push('--timestamp', shellQuote(error.timestamp))
  for (const repository of error.repositories ?? [])
    parts.push('--repository', shellQuote(repository))
  process.stderr.write(`Replay with: ${parts.join(' ')}\n`)
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2)
  if ((subcommand === '-h' || subcommand === '--help') && rest.length === 0) {
    printUsage(process.stdout)
    return
  }
  if (
    (subcommand === 'append' || subcommand === 'entries') &&
    rest.length === 1 &&
    (rest[0] === '-h' || rest[0] === '--help')
  ) {
    printUsage(process.stdout)
    return
  }
  if (subcommand === 'entries') {
    process.stdout.write(`${await runEntries(rest)}\n`)
    return
  }
  if (subcommand !== 'append') {
    printUsage()
    process.exit(1)
  }
  process.stdout.write(`${await runAppend(rest)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    if (err instanceof BlackboardJournalError) printReplayCommand(err)
    process.exit(1)
  })
}
