import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkCostTableConsistencyGuard } from './cost-table-consistency-guard.mts'

const CANONICAL_COST_DOCS = [
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-pre-launch-baseline.md',
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-steady-state.md',
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-public-ipv4-subtotal.md',
] as const
const PARENT_LEAF =
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-aws-costs.md'
const OTHER_LEAF = 'docs/overview/infrastructure/reference-deployment-costs-ci-testing-costs.md'
const NEW_LEAF = 'docs/overview/infrastructure/reference-deployment-costs-newly-added.md'

const totalTable = [
  '| Service | Est. $/mo |',
  '| --- | --- |',
  '| Lambda | ~$1 |',
  '| **Total** | **~$1** |',
  '',
].join('\n')

function write(repoRoot: string, path: string, content: string): void {
  mkdirSync(dirname(join(repoRoot, path)), { recursive: true })
  writeFileSync(join(repoRoot, path), content)
}

function makeRepo(extra: Record<string, string> = {}): string {
  const repoRoot = mkdtempSync(join(tmpdir(), 'voucha-cost-table-discovery-'))
  for (const file of CANONICAL_COST_DOCS) write(repoRoot, file, totalTable)
  for (const [file, content] of Object.entries(extra)) write(repoRoot, file, content)
  return repoRoot
}

function errorsFor(repoRoot: string, trackedFiles: readonly string[]): string[] {
  const errors: string[] = []
  checkCostTableConsistencyGuard(repoRoot, trackedFiles, errors)
  return errors
}

describe('checkCostTableConsistencyGuard deployment-cost leaf discovery', () => {
  const testDirs: string[] = []

  afterEach(() => {
    for (const dir of testDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  it.each(CANONICAL_COST_DOCS)('accepts the exact canonical cost leaf %s', file => {
    const repoRoot = makeRepo()
    testDirs.push(repoRoot)

    expect(errorsFor(repoRoot, CANONICAL_COST_DOCS)).toEqual([])
    expect(CANONICAL_COST_DOCS).toContain(file)
  })

  it('rejects copied totals in the extracted AWS parent and another deployment-cost leaf', () => {
    const repoRoot = makeRepo({ [PARENT_LEAF]: totalTable, [OTHER_LEAF]: totalTable })
    testDirs.push(repoRoot)

    expect(errorsFor(repoRoot, [...CANONICAL_COST_DOCS, PARENT_LEAF, OTHER_LEAF])).toEqual(
      [
        `::error file=${PARENT_LEAF},line=1::${PARENT_LEAF}: do not duplicate cost-total tables outside canonical cost table leaves`,
        `::error file=${OTHER_LEAF},line=1::${OTHER_LEAF}: do not duplicate cost-total tables outside canonical cost table leaves`,
      ].toSorted(),
    )
  })

  it('does not mistake ordinary dollar content for a copied Total table', () => {
    const repoRoot = makeRepo({ [OTHER_LEAF]: 'This optional feature costs ~$1/month.\n' })
    testDirs.push(repoRoot)

    expect(errorsFor(repoRoot, [...CANONICAL_COST_DOCS, OTHER_LEAF])).toEqual([])
  })

  it('discovers newly tracked matching leaves without a maintained list', () => {
    const repoRoot = makeRepo({ [NEW_LEAF]: totalTable, [PARENT_LEAF]: totalTable })
    testDirs.push(repoRoot)

    expect(errorsFor(repoRoot, [NEW_LEAF])).toContain(
      `::error file=${NEW_LEAF},line=1::${NEW_LEAF}: do not duplicate cost-total tables outside canonical cost table leaves`,
    )
  })

  it('uses the tracked non-gitignored input rather than scanning an untracked physical leaf', () => {
    const repoRoot = makeRepo({ [PARENT_LEAF]: totalTable })
    testDirs.push(repoRoot)

    expect(errorsFor(repoRoot, CANONICAL_COST_DOCS)).toEqual([])
  })
})
