#!/usr/bin/env node

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { feedbackOutboxStatus, flushFeedbackOutbox } from 'vouchington-tooling/agent-blackboard'
import { parseFlagArgs } from './blackboard/parse-flag-args.mts'

import { BlackboardJournalError, runAppend } from './blackboard-journal/append.mts'
import { runEntries } from './blackboard-journal/entries.mts'

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
  stream.write(
    'Usage: node dev/blackboard-journal.mts append --file <path> ' +
      '--mode <interactive|autonomous> --source-event-id <id> --work-outcome <outcome> ' +
      '--coverage-status <status> [--coverage-source <source,...>] [--dropped-count <n>] ' +
      '[--outbox-directory <path>] [--session-id <id>] [--parent-session-id <id>] [--agent <name>] ' +
      '[--version <version>] [--timestamp <iso8601>] [--repository <owner/name> ...]\n' +
      '       node dev/blackboard-journal.mts append --file <path> ' +
      '--mode <interactive|autonomous> --source-event-id <id> --work-outcome <outcome> ' +
      '--coverage-status <status> [--coverage-source <source,...>] [--dropped-count <n>] ' +
      '[--outbox-directory <path>] --root-codex [--new-root-codex-session] [--agent codex] ' +
      '[--version <version>] [--timestamp <iso8601>] [--repository <owner/name> ...]\n' +
      '       node dev/blackboard-journal.mts entries [--session-id <id> | --root-codex [--new-root-codex-session]]\n' +
      '       node dev/blackboard-journal.mts outbox-status|outbox-flush [--outbox-directory <path>]\n' +
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
  if (error.mode) parts.push('--mode', shellQuote(error.mode))
  if (error.sourceEventId) parts.push('--source-event-id', shellQuote(error.sourceEventId))
  if (error.workOutcome) parts.push('--work-outcome', shellQuote(error.workOutcome))
  if (error.coverageStatus) parts.push('--coverage-status', shellQuote(error.coverageStatus))
  if (error.coverageSource) parts.push('--coverage-source', shellQuote(error.coverageSource))
  if (error.droppedCount) parts.push('--dropped-count', shellQuote(error.droppedCount))
  if (error.outboxDirectory) parts.push('--outbox-directory', shellQuote(error.outboxDirectory))
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
  if (subcommand === 'outbox-status' || subcommand === 'outbox-flush') {
    const { parsed, positional } = parseFlagArgs<{ directory?: string }>(rest, {
      '--outbox-directory': 'directory',
    })
    if (positional.length) throw new Error('outbox commands do not accept positional arguments')
    const directory = parsed.directory ?? join(process.cwd(), '.local', 'blackboard-outbox')
    const result =
      subcommand === 'outbox-status'
        ? feedbackOutboxStatus(directory)
        : await flushFeedbackOutbox({ directory })
    process.stdout.write(`${JSON.stringify(result)}\n`)
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
  process.stdout.write(`${JSON.stringify(await runAppend(rest))}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    if (err instanceof BlackboardJournalError) printReplayCommand(err)
    process.exit(1)
  })
}
