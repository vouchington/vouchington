#!/usr/bin/env node

import { runCompose } from './retrospective-save/compose.mts'
import { runCheck } from './retrospective-save/check.mts'
import { RetrospectiveSaveError, runSave } from './retrospective-save/save.mts'

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
  stream.write(
    'Usage: node dev/retrospective-save.mts save --mode interactive|autonomous [--work-outcome <terminal-outcome>] --file <path> ' +
      '[--session-id <id>] [--parent-session-id <id>] [--agent <name>] [--version <version>]\n' +
      '       node dev/retrospective-save.mts save --mode interactive|autonomous [--work-outcome <terminal-outcome>] --file <path> ' +
      '--root-codex [--new-root-codex-session] [--agent codex] [--version <version>]\n' +
      '       node dev/retrospective-save.mts check [--session-id <id> | --root-codex [--new-root-codex-session]]\n' +
      '       node dev/retrospective-save.mts compose --input <json-file>\n' +
      'Note: save preserves composed outcome/coverage metadata; files without it require --work-outcome.\n' +
      'Note: check --root-codex refreshes the worktree-local root identity before reading the server.\n',
  )
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

// Only printable when the failure carried a stagedFile (i.e. it happened after
// arg parsing succeeded) — plain arg-parsing errors have no meaningful replay.
function printReplayCommand(error: RetrospectiveSaveError): void {
  if (!error.stagedFile) return
  const parts = [
    'node',
    'dev/retrospective-save.mts',
    'save',
    '--file',
    shellQuote(error.stagedFile),
  ]
  if (error.sessionIdArg) parts.push('--session-id', shellQuote(error.sessionIdArg))
  if (error.parentSessionId) parts.push('--parent-session-id', shellQuote(error.parentSessionId))
  if (error.agent) parts.push('--agent', shellQuote(error.agent))
  if (error.rootCodex) parts.push('--root-codex')
  if (error.newRootCodexSession) parts.push('--new-root-codex-session')
  if (error.version) parts.push('--version', shellQuote(error.version))
  for (const [key, flag] of Object.entries({
    mode: '--mode',
    sourceEventId: '--source-event-id',
    workOutcome: '--work-outcome',
    coverageStatus: '--coverage-status',
    droppedCount: '--dropped-count',
    outboxDirectory: '--outbox-directory',
    category: '--category',
    timestamp: '--timestamp',
  })) {
    const value = error.feedback[key as keyof typeof error.feedback]
    if (typeof value === 'string') parts.push(flag, shellQuote(value))
  }
  for (const source of error.feedback.coverageSources ?? [])
    parts.push('--coverage-source', shellQuote(source))
  for (const repository of error.feedback.repositories ?? [])
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
    (subcommand === 'save' || subcommand === 'check' || subcommand === 'compose') &&
    rest.length === 1 &&
    (rest[0] === '-h' || rest[0] === '--help')
  ) {
    printUsage(process.stdout)
    return
  }
  if (subcommand === 'compose') {
    process.stdout.write(`${await runCompose(rest)}\n`)
    return
  }
  if (subcommand === 'check') {
    process.stdout.write(`${await runCheck(rest)}\n`)
    return
  }
  if (subcommand !== 'save') {
    printUsage()
    process.exit(1)
  }
  process.stdout.write(`${await runSave(rest)}\n`)
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    if (err instanceof RetrospectiveSaveError) printReplayCommand(err)
    process.exit(1)
  })
}
