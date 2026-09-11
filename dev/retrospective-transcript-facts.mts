#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  runRetrospectiveTranscript,
  type ResolveOptions,
} from 'vouchington-tooling/retrospective-transcript'

function requireValue(raw: string | boolean | undefined, flag: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.startsWith('-')) {
    throw new Error(`${flag} requires a value`)
  }
  return raw
}

function parseCliArgs(argv: string[]): ResolveOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      'session-id': { type: 'string' },
      'projects-dir': { type: 'string' },
      'codex-sessions-dir': { type: 'string' },
      jsonl: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  })
  return {
    ...(values['session-id'] === undefined
      ? {}
      : { sessionId: requireValue(values['session-id'], '--session-id') }),
    ...(values['projects-dir'] === undefined
      ? {}
      : { projectsDir: requireValue(values['projects-dir'], '--projects-dir') }),
    ...(values['codex-sessions-dir'] === undefined
      ? {}
      : {
          codexSessionsDir: requireValue(values['codex-sessions-dir'], '--codex-sessions-dir'),
        }),
    ...(values.jsonl === undefined ? {} : { jsonlPath: requireValue(values.jsonl, '--jsonl') }),
  }
}

export async function run(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return runRetrospectiveTranscript({ ...parseCliArgs(argv), env })
}

async function main(): Promise<void> {
  process.stdout.write(await run(process.argv.slice(2)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
