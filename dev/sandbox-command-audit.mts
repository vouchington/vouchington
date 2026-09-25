#!/usr/bin/env node

import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs as nodeParseArgs } from 'node:util'

import { isValidSessionId } from './agent-session-id/valid-id.mts'
import { resolveRepoRoots } from './sandbox-command-audit/repo-scope.mts'
import { classifyAudit } from './sandbox-command-audit/classify.mts'
import { formatReport, HEADER } from './sandbox-command-audit/report.mts'
import { scanTranscripts } from './sandbox-command-audit/scan.mts'

const DEFAULT_LIMIT = 50

export type CliOptions = {
  projectsDir: string
  codexSessionsDir: string
  settingsPath: string
  maxFilesPerRoot: number
  sinceDays?: number
  sessionId?: string
  json: boolean
  raw: boolean
  // undefined = auto-resolve from git (see resolveRepoRoots in repo-scope.mts).
  repoRoots?: string[]
}

function defaultOptions(env: NodeJS.ProcessEnv): CliOptions {
  const home = env.HOME ?? homedir()
  return {
    projectsDir: join(home, '.claude', 'projects'),
    codexSessionsDir: join(home, '.codex', 'sessions'),
    settingsPath: join(process.cwd(), '.claude', 'settings.json'),
    maxFilesPerRoot: DEFAULT_LIMIT,
    json: false,
    raw: false,
  }
}

function requireValue(raw: string | boolean | undefined, flag: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.startsWith('-')) {
    throw new Error(`${flag} requires a value`)
  }
  return raw
}

// Validates a repeatable flag's values the same way requireValue validates a scalar
// one's — an empty or flag-shaped value still means the user meant something else.
function requireValues(raw: string[] | undefined, flag: string): string[] {
  const values = raw ?? []
  for (const value of values) {
    if (value.length === 0 || value.startsWith('-')) {
      throw new Error(`${flag} requires a value`)
    }
  }
  return values
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const options = defaultOptions(env)
  const { values } = nodeParseArgs({
    args: argv,
    options: {
      json: { type: 'boolean' },
      raw: { type: 'boolean' },
      limit: { type: 'string' },
      since: { type: 'string' },
      'session-id': { type: 'string' },
      'projects-dir': { type: 'string' },
      'codex-sessions-dir': { type: 'string' },
      'settings-path': { type: 'string' },
      'repo-root': { type: 'string', multiple: true },
    },
    strict: true,
    allowPositionals: true,
  })

  if (values.json === true) options.json = true
  if (values.raw === true) options.raw = true

  if (values.limit !== undefined) {
    const parsed = Number.parseInt(requireValue(values.limit, '--limit'), 10)
    if (!Number.isFinite(parsed) || parsed <= 0)
      throw new Error('--limit requires a positive integer')
    options.maxFilesPerRoot = parsed
  }
  if (values.since !== undefined) {
    const parsed = Number.parseInt(requireValue(values.since, '--since'), 10)
    if (!Number.isFinite(parsed) || parsed <= 0)
      throw new Error('--since requires a positive integer')
    options.sinceDays = parsed
  }
  if (values['session-id'] !== undefined) {
    const sessionId = requireValue(values['session-id'], '--session-id')
    if (!isValidSessionId(sessionId)) {
      throw new Error(`--session-id has an invalid format: ${sessionId}`)
    }
    options.sessionId = sessionId
  }
  if (values['projects-dir'] !== undefined) {
    options.projectsDir = requireValue(values['projects-dir'], '--projects-dir')
  }
  if (values['codex-sessions-dir'] !== undefined) {
    options.codexSessionsDir = requireValue(values['codex-sessions-dir'], '--codex-sessions-dir')
  }
  if (values['settings-path'] !== undefined) {
    options.settingsPath = requireValue(values['settings-path'], '--settings-path')
  }
  if (values['repo-root'] !== undefined) {
    options.repoRoots = requireValues(values['repo-root'], '--repo-root')
  }

  return options
}

// Scan -> classify -> report. classifyAudit only fails when .claude/settings.json
// itself can't be read/parsed — a real repo checkout always has one, so this is a
// defensive path rather than an expected outcome.
export async function run(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const options = parseArgs(argv, env)
  let repoRoots: string[]
  try {
    repoRoots = await resolveRepoRoots(options.repoRoots, process.cwd())
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return `${[
      HEADER,
      `Status: unavailable (repo root resolution failed: ${reason} — pass --repo-root to skip git and scope discovery explicitly)`,
    ].join('\n')}\n`
  }
  const scan = await scanTranscripts({ ...options, repoRoots })
  const categorized = classifyAudit(scan, { settingsPath: options.settingsPath })
  if ('error' in categorized) {
    return `${[HEADER, `Status: unavailable (${categorized.error})`].join('\n')}\n`
  }
  return formatReport(scan, categorized, { json: options.json, raw: options.raw })
}

async function main(): Promise<void> {
  process.stdout.write(await run(process.argv.slice(2)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
