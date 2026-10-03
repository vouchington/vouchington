import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { glob, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  reconcileBaseline,
  rowsFromReport,
  type BaselineRow,
  type FindingIdentity,
} from './dead-code-baseline.mts'
import { copyTrackedWorkingTree } from './tracked-snapshot.mts'

const repoRoot = resolve(import.meta.dirname, '../..')
const baselinePath = join(import.meta.dirname, 'dead-code-baseline.json')

function mode(args: string[]): 'check' | 'seed' | 'update' {
  if (args.length === 0) return 'check'
  if (args.length === 1 && args[0] === '--seed') return 'seed'
  if (args.length === 1 && args[0] === '--update') return 'update'
  throw new Error('Usage: node static-code-analysis/jscpd/dead-code-gate.mts [--seed|--update]')
}

async function validateEntryRoots(snapshotRoot: string): Promise<void> {
  const config = JSON.parse(await readFile(join(snapshotRoot, '.jscpd.json'), 'utf8')) as {
    deadCode?: { entry?: unknown }
  }
  const entries = config?.deadCode?.entry
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('jscpd deadCode.entry must contain at least one root')
  }
  for (const entry of entries) {
    if (
      typeof entry !== 'string' ||
      entry.length === 0 ||
      entry.startsWith('/') ||
      entry.includes('\\') ||
      entry.split('/').includes('..')
    ) {
      throw new Error(`Invalid dead-code entry root: ${String(entry)}`)
    }
    let matches = 0
    for await (const _ of glob(entry, { cwd: snapshotRoot })) matches += 1
    if (matches === 0) throw new Error(`Stale dead-code entry root: ${entry}`)
  }
}

export async function scanDeadCode(
  snapshotRoot: string,
  reportRoot: string,
  binary: string,
): Promise<BaselineRow[]> {
  execFileSync(
    binary,
    [
      '--dead-code',
      '--no-gitignore',
      '--config',
      '.jscpd.json',
      '--reporters',
      'json',
      '--output',
      reportRoot,
      '--exit-code',
      '0',
      '.',
    ],
    { cwd: snapshotRoot, stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 },
  )
  const report = JSON.parse(
    await readFile(join(reportRoot, 'basta-report.json'), 'utf8'),
  ) as unknown
  return rowsFromReport(report, includeFinding)
}

function includeFinding(finding: FindingIdentity, raw: Record<string, unknown>): boolean {
  if (
    finding.category === 'unused-file' &&
    Array.isArray(raw['reasons']) &&
    raw['reasons'].includes('used-only-by-tests')
  )
    return false
  const segments = finding.path.split('/')
  if (
    finding.path.startsWith('web/storybook/') ||
    segments.some(
      part => part === 'test-helpers' || part === '__tests__' || part === 'integration-tests',
    )
  ) {
    return false
  }
  return !/\.(test|spec)\.[^/]+$/.test(finding.path)
}

async function prepareSnapshot(snapshotRoot: string): Promise<number> {
  const copied = await copyTrackedWorkingTree(repoRoot, snapshotRoot)
  await validateEntryRoots(snapshotRoot)
  return copied
}

async function main(): Promise<void> {
  const operation = mode(process.argv.slice(2))
  if (operation === 'seed' && existsSync(baselinePath)) {
    throw new Error('Initial baseline already exists; --seed cannot replace it')
  }
  if (operation !== 'seed' && !existsSync(baselinePath)) {
    throw new Error('Dead-code baseline is missing; --seed is required for first adoption')
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'voucha-jscpd-dead-code-'))
  try {
    const snapshotRoot = join(temporaryRoot, 'snapshot')
    const reportRoot = join(temporaryRoot, 'report')
    const copied = await prepareSnapshot(snapshotRoot)
    const current = await scanDeadCode(
      snapshotRoot,
      reportRoot,
      join(repoRoot, 'node_modules/.bin/jscpd'),
    )
    if (operation === 'seed') {
      await reconcileBaseline(baselinePath, current, operation)
      console.log(
        `Seeded dead-code baseline with ${current.length} identities from ${copied} tracked files`,
      )
      return
    }
    const stale = await reconcileBaseline(baselinePath, current, operation)
    if (operation === 'update') {
      console.log(`Dead-code baseline removed ${stale} stale identities; ${current.length} remain`)
      return
    }
    console.log(
      `Dead-code baseline matches ${current.length} identities across ${copied} tracked files`,
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
