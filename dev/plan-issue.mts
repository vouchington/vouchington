#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { validateMermaidMarkdown } from 'no-mistakes'

import { buildPlanIssueCreateArgs, validatePlanIssue } from './plan-issue/validate.mts'

const execFileAsync = promisify(execFile)

type PlanIssueDependencies = {
  readBody: (path: string) => Promise<string>
  resolveRepo: () => Promise<string>
  runGh: (args: string[]) => Promise<string>
  validateMermaid: (body: string) => Promise<string[]>
  withBodySnapshot: <T>(body: string, fn: (path: string) => Promise<T>) => Promise<T>
}

type Args = { bodyFile?: string; labels: string[]; repo?: string; title?: string }

const VALUE_OPTIONS = new Set(['--title', '--body-file', '--label', '--repo'])
const USAGE =
  'Usage: node dev/plan-issue.mts validate|create --title <title> --body-file <path> [--label <label>] [--repo <owner/repo>]'

export async function validatePlanMermaidMarkdown(body: string): Promise<string[]> {
  const result = await validateMermaidMarkdown({ content: body, file: 'Plan issue body' })
  return result.diagnostics.map(
    diagnostic => `${diagnostic.file}:${diagnostic.fenceLine}: ${diagnostic.message}`,
  )
}

export function parsePlanIssueArgs(argv: string[]): Args {
  const result: Args = { labels: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    const value = argv[index + 1]
    const hasValue = value !== undefined && !VALUE_OPTIONS.has(value)
    if (option === '--title' && hasValue) result.title = argv[++index]
    else if (option === '--body-file' && hasValue) result.bodyFile = argv[++index]
    else if (option === '--label' && hasValue) result.labels.push(argv[++index])
    else if (option === '--repo') {
      if (!hasValue) throw new Error('--repo requires an owner/repo value')
      if (result.repo !== undefined) throw new Error('--repo may be provided only once')
      result.repo = argv[++index]
    } else throw new Error(`Unknown or incomplete option: ${option}`)
  }
  if (result.title === undefined || result.bodyFile === undefined || result.bodyFile === '-') {
    throw new Error('Both --title and a readable, non-stdin --body-file are required.')
  }
  return result
}

export async function executePlanIssue(
  commandArgs: string[],
  dependencies: PlanIssueDependencies,
): Promise<string> {
  if (commandArgs.length === 1 && ['-h', '--help'].includes(commandArgs[0])) return `${USAGE}\n`
  const [subcommand, ...argv] = commandArgs
  if (subcommand !== 'validate' && subcommand !== 'create') {
    throw new Error(USAGE)
  }
  const args = parsePlanIssueArgs(argv)
  const body = await dependencies.readBody(args.bodyFile as string)
  const preliminaryErrors = validatePlanIssue(args.title as string, body)
  if (preliminaryErrors.length > 0)
    throw new Error(`Plan issue validation failed:\n  - ${preliminaryErrors.join('\n  - ')}`)
  const mermaidErrors = await dependencies.validateMermaid(body)
  if (mermaidErrors.length > 0)
    throw new Error(`Plan issue Mermaid validation failed:\n  - ${mermaidErrors.join('\n  - ')}`)
  const targetRepository = args.repo ?? (await dependencies.resolveRepo()).trim()
  if (!/^[^/\s]+\/[^/\s]+$/.test(targetRepository))
    throw new Error('Could not resolve the target repository as owner/repo.')
  const errors = validatePlanIssue(args.title as string, body, targetRepository)
  if (errors.length > 0)
    throw new Error(`Plan issue validation failed:\n  - ${errors.join('\n  - ')}`)
  if (subcommand === 'validate') {
    return 'Plan issue is valid.\n'
  }
  return dependencies.withBodySnapshot(body, snapshotPath =>
    dependencies.runGh(
      buildPlanIssueCreateArgs(args.title as string, snapshotPath, args.labels, args.repo),
    ),
  )
}

export async function withPrivateBodySnapshot<T>(
  body: string,
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'plan-issue-'))
  const path = join(directory, 'body.md')
  try {
    await writeFile(path, body, { encoding: 'utf8', mode: 0o600 })
    return await fn(path)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

async function main(): Promise<void> {
  const output = await executePlanIssue(process.argv.slice(2), {
    readBody: path => readFile(path, 'utf8'),
    resolveRepo: async () => {
      const { stdout } = await execFileAsync('gh', [
        'repo',
        'view',
        '--json',
        'nameWithOwner',
        '--jq',
        '.nameWithOwner',
      ])
      return stdout
    },
    runGh: async args => {
      const { stdout } = await execFileAsync('gh', args)
      return stdout
    },
    validateMermaid: validatePlanMermaidMarkdown,
    withBodySnapshot: withPrivateBodySnapshot,
  })
  process.stdout.write(output)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
