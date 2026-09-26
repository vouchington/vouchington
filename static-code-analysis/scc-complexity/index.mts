import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { relative, resolve, win32 } from 'node:path'
import { promisify } from 'node:util'

import type { SharedContext } from 'vouchington-tooling/shared-context'

const execFileAsync = promisify(execFile)

export const SCC_COMPLEXITY_LIMIT = 50

export const SCC_COMPLEXITY_ARGS = [
  '--format',
  'json',
  '--include-ext',
  'js,mts,jsx,ts,tsx',
  '--by-file',
  '--sort',
  'complexity',
  '--exclude-dir',
  '.git,fixtures,__tests__,test-helpers',
  '--not-match',
  String.raw`\.(test|spec)\.`,
  '--no-cocomo',
  '.',
] as const

type RunScc = (outputPath: string) => Promise<string>

export async function checkSccComplexity(
  ctx: SharedContext,
  runScc?: RunScc,
  options: { command?: string } = {},
): Promise<{ errors: string[] }> {
  if (!ctx.isInsideGitRepo) {
    return {
      errors: [
        `::error::${escapeWorkflowCommandMessage(ctx.repoRoot)} is not inside a git repository`,
      ],
    }
  }

  const dir = await mkdtemp(joinTmp('voucha-scc-complexity-'))
  try {
    const outputPath = resolve(dir, 'scc.json')
    const json = await (
      runScc ?? ((path: string) => runSccJson(ctx.repoRoot, path, options.command))
    )(outputPath)
    const tracked = new Set(
      [...ctx.trackedFileSet].map(file => canonicalRepoPath(ctx.repoRoot, file)),
    )
    return { errors: violations(parseSccFiles(json, ctx.repoRoot), tracked) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { errors: [`::error::scc-complexity failed: ${escapeWorkflowCommandMessage(message)}`] }
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
}

function joinTmp(prefix: string): string {
  return resolve(tmpdir(), prefix)
}

async function runSccJson(repoRoot: string, outputPath: string, command?: string): Promise<string> {
  try {
    await execFileAsync(command ?? 'scc', [...SCC_COMPLEXITY_ARGS, '--output', outputPath], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    })
  } catch (error) {
    if (isNodeSystemError(error) && error.code === 'ENOENT') {
      throw new Error('scc executable not found; install with mise install', { cause: error })
    }
    throw error
  }
  return readFile(outputPath, 'utf8')
}

function parseSccFiles(
  json: string,
  repoRoot: string,
): Array<{ complexity: number; file: string }> {
  const parsed = JSON.parse(json) as unknown
  if (!Array.isArray(parsed)) throw new Error('scc JSON output must be an array')
  const values: Array<{ complexity: number; file: string }> = []
  for (const language of parsed) {
    if (!isRecord(language) || !Array.isArray(language.Files)) continue
    for (const file of language.Files) {
      if (
        !isRecord(file) ||
        typeof file.Location !== 'string' ||
        typeof file.Complexity !== 'number'
      ) {
        continue
      }
      values.push({
        complexity: file.Complexity,
        file: canonicalRepoPath(repoRoot, file.Location),
      })
    }
  }
  return values
}

function violations(
  values: readonly { complexity: number; file: string }[],
  tracked: ReadonlySet<string>,
): string[] {
  return values
    .filter(value => tracked.has(value.file) && value.complexity > SCC_COMPLEXITY_LIMIT)
    .toSorted((a, b) => b.complexity - a.complexity || a.file.localeCompare(b.file))
    .map(value => {
      const detail = `${value.file}: scc complexity ${value.complexity} exceeds ${SCC_COMPLEXITY_LIMIT}; simplify or split this file`
      return `::error file=${escapeWorkflowCommandProperty(value.file)}::${escapeWorkflowCommandMessage(detail)}`
    })
}

function canonicalRepoPath(repoRoot: string, path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (win32.parse(normalized).root) return normalized
  const relativePath = relative(repoRoot, resolve(repoRoot, normalized)).replaceAll('\\', '/')
  return relativePath || '.'
}

function escapeWorkflowCommandMessage(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

function escapeWorkflowCommandProperty(value: string): string {
  return escapeWorkflowCommandMessage(value).replaceAll(':', '%3A').replaceAll(',', '%2C')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
