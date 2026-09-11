#!/usr/bin/env node
import { fileURLToPath } from 'node:url'

import { buildSessionFrictionReport } from 'vouchington-tooling/session-friction'

import { type BlackboardEntriesClient } from '../blackboard/client.mts'
import { parseFlagArgs, type FlagKey } from '../blackboard/parse-flag-args.mts'
import { requireSessionId } from '../agent-session-id/resolve.mts'
import { frictionLogDirectory } from './config.mts'
import { loadJournalEntries } from './report/journal.mts'

// CLI reader printing ready-to-paste "## CI Failures" and "## Sandbox & Permission Audit" blocks
// for the retrospective skill to paste directly into a session's retro doc. The session id
// is resolved exactly once by the CLI guard below and threaded through unchanged to both
// the friction-log lookup and the journal lookup — they must never diverge.
export async function buildReport(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
  entriesClient?: BlackboardEntriesClient,
  stderr: { write(chunk: string): unknown } = process.stderr,
): Promise<string> {
  const report = await buildSessionFrictionReport(sessionId, {
    directory: frictionLogDirectory(env),
    journalLoader: id => loadJournalEntries(id, env, entriesClient),
  })
  if (report.diagnostic)
    stderr.write(`session-friction: report unavailable: ${report.diagnostic}\n`)
  return report.markdown
}

type ParsedArgs = { newRootCodexSession?: boolean; rootCodex?: boolean; sessionIdArg?: string }
const FLAG_KEYS: Record<string, FlagKey<ParsedArgs>> = {
  '--new-root-codex-session': { key: 'newRootCodexSession', type: 'boolean' },
  '--root-codex': { key: 'rootCodex', type: 'boolean' },
  '--session-id': 'sessionIdArg',
}

async function main(): Promise<void> {
  const output = await runReport(process.argv.slice(2))
  process.stdout.write(`${output}\n`)
}

export async function runReport(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  entriesClient?: BlackboardEntriesClient,
  cwd = process.cwd(),
): Promise<string> {
  const { parsed } = parseFlagArgs<ParsedArgs>(argv, FLAG_KEYS)
  const sessionId = requireSessionId({
    sessionIdArg: parsed.sessionIdArg,
    cwd,
    env,
    newRootCodexSession: parsed.newRootCodexSession,
    rootCodex: parsed.rootCodex,
  })
  return buildReport(sessionId, env, entriesClient)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
