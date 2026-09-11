#!/usr/bin/env node

import { fileURLToPath } from 'node:url'

import { runCheck } from './retrospective-save/check.mts'
import { RetrospectiveSaveError, runSave } from './retrospective-save/save.mts'

function printUsage(stream: NodeJS.WritableStream = process.stderr): void {
  stream.write(
    'Usage: node dev/retrospective-save.mts save --file <path> ' +
      '[--session-id <id>] [--parent-session-id <id>] [--agent <name>] [--version <version>]\n' +
      '       node dev/retrospective-save.mts save --file <path> ' +
      '--root-codex [--new-root-codex-session] [--agent codex] [--version <version>]\n' +
      '       node dev/retrospective-save.mts check [--session-id <id> | --root-codex [--new-root-codex-session]]\n' +
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
  process.stderr.write(`Replay with: ${parts.join(' ')}\n`)
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2)
  if ((subcommand === '-h' || subcommand === '--help') && rest.length === 0) {
    printUsage(process.stdout)
    return
  }
  if (
    (subcommand === 'save' || subcommand === 'check') &&
    rest.length === 1 &&
    (rest[0] === '-h' || rest[0] === '--help')
  ) {
    printUsage(process.stdout)
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    if (err instanceof RetrospectiveSaveError) printReplayCommand(err)
    process.exit(1)
  })
}
