import { existsSync } from 'node:fs'
import { glob, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { reconcileBaseline } from './dead-code-baseline.mts'
import { copyTrackedWorkingTree } from './tracked-snapshot.mts'
import { validateDeadCodeConfig } from './dead-code-scope.mts'
import { scanDeadCode } from './dead-code-scan.mts'

const repoRoot = resolve(import.meta.dirname, '../..')
const baselinePath = join(import.meta.dirname, 'dead-code-baseline.json')

function mode(args: string[]): 'check' | 'seed' | 'update' {
  if (args.length === 0) return 'check'
  if (args.length === 1 && args[0] === '--seed') return 'seed'
  if (args.length === 1 && args[0] === '--update') return 'update'
  throw new Error('Usage: node static-code-analysis/jscpd/dead-code-gate.mts [--seed|--update]')
}

async function validateEntryRoots(snapshotRoot: string): Promise<void> {
  const config = JSON.parse(await readFile(join(snapshotRoot, '.jscpd.json'), 'utf8')) as unknown
  const entries = validateDeadCodeConfig(config)
  for (const entry of entries) {
    let matches = 0
    for await (const _ of glob(entry, { cwd: snapshotRoot })) matches += 1
    if (matches === 0) throw new Error(`Stale dead-code entry root: ${entry}`)
  }
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

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
