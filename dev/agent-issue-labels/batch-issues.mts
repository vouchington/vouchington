import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { parseManifest } from './batch/manifest.mts'
import { executePreflight } from './batch/preflight.mts'
import { summarizePreflight } from './batch/summary.mts'

const execFileAsync = promisify(execFile)

export type BatchArgs = {
  subcommand: 'preflight'
  sessionDir: string
  repo: string
}

export function parseBatchArgs(argv: string[]): BatchArgs {
  const [subcommand, ...rest] = argv
  if (subcommand !== 'preflight') {
    throw new Error(
      'Usage: node dev/agent-issue-labels/batch-issues.mts preflight --session-dir <path> --repo <owner/repo>',
    )
  }

  let sessionDir: string | undefined
  let repo: string | undefined

  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index]
    if (option === '--session-dir') {
      if (sessionDir !== undefined) throw new Error('--session-dir may be provided only once')
      sessionDir = rest[(index += 1)]
      if (sessionDir === undefined) throw new Error('--session-dir requires a path')
    } else if (option === '--repo') {
      if (repo !== undefined) throw new Error('--repo may be provided only once')
      repo = rest[(index += 1)]
      if (repo === undefined) throw new Error('--repo requires an owner/repo value')
    } else {
      throw new Error(`Unknown or incomplete option: ${option}`)
    }
  }

  if (sessionDir === undefined) throw new Error('--session-dir is required')
  if (repo === undefined) throw new Error('--repo is required')

  return { subcommand: subcommand as BatchArgs['subcommand'], sessionDir, repo }
}

export type BatchDeps = {
  readManifest: (sessionDir: string) => Promise<string>
  readBody: (path: string) => Promise<string>
  runGh: (args: string[]) => Promise<string>
  pathExists: (path: string) => Promise<boolean>
  writeArtifact: (path: string, data: unknown) => Promise<void>
  labelerPath: string
}

async function loadManifest(sessionDir: string, deps: BatchDeps, expectedRepo: string) {
  const manifest = parseManifest(await deps.readManifest(sessionDir))
  if (manifest.targetRepo !== expectedRepo) {
    throw new Error(
      `CLI --repo "${expectedRepo}" does not match manifest targetRepo "${manifest.targetRepo}"`,
    )
  }
  return manifest
}

/** Read-only GitHub preflight that writes only its JSON report under `sessionDir`. */
export async function executeBatch(
  commandArgs: string[],
  deps: BatchDeps,
): Promise<{ exitCode: number; summary: string }> {
  const args = parseBatchArgs(commandArgs)
  const preflightPath = join(args.sessionDir, 'preflight-report.json')
  // ast-grep-ignore: no-three-sequential-awaits -- manifest validation, live preflight, and report persistence are dependent
  const manifest = await loadManifest(args.sessionDir, deps, args.repo)
  const report = await executePreflight(manifest, {
    runGh: deps.runGh,
    pathExists: deps.pathExists,
    readBody: deps.readBody,
    labelerPath: deps.labelerPath,
    sessionDir: args.sessionDir,
  })
  await deps.writeArtifact(preflightPath, report)
  return {
    exitCode: report.status === 'pass' ? 0 : 1,
    summary: summarizePreflight(report),
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const result = await executeBatch(process.argv.slice(2), {
    readManifest: sessionDir => readFile(join(sessionDir, 'manifest.json'), 'utf8'),
    readBody: path => readFile(path, 'utf8'),
    runGh: async ghArgs => {
      const { stdout, stderr } = await execFileAsync('gh', ghArgs)
      if (stderr.length > 0) process.stderr.write(stderr)
      return stdout
    },
    pathExists,
    writeArtifact: async (path, data) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(data, null, 2))
    },
    labelerPath: '.github/labeler.yml',
  })
  process.stdout.write(result.summary)
  process.exitCode = result.exitCode
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
