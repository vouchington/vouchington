import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkCostTableConsistencyGuard } from '../cost-table-consistency-guard.mts'

const CANONICAL_COST_DOCS = [
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-pre-launch-baseline.md',
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-steady-state.md',
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-public-ipv4-subtotal.md',
] as const
const INFRASTRUCTURE_DOC = 'docs/overview/infrastructure/infrastructure.md'
const OLD_COST_DOC = 'docs/overview/infrastructure/deployment-costs.md'

function makeRepo(
  canonicalDoc: string,
  infrastructureDoc = '[Costs](deployment-costs.md)\n',
): string {
  const dir = mkdtempSync(join(tmpdir(), 'voucha-cost-table-parser-'))
  for (const file of CANONICAL_COST_DOCS) write(dir, file, canonicalDoc)
  write(dir, INFRASTRUCTURE_DOC, infrastructureDoc)
  return dir
}

function write(repoRoot: string, path: string, content: string): void {
  mkdirSync(dirname(join(repoRoot, path)), { recursive: true })
  writeFileSync(join(repoRoot, path), content)
}

describe('checkCostTableConsistencyGuard shared Markdown parser', () => {
  const testDirs: string[] = []

  afterEach(() => {
    for (const dir of testDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  it('accepts canonical tables without trailing pipes', () => {
    const dir = makeRepo(
      [
        '# Deployment Costs',
        '',
        '| Service | Notes | Est. $/mo/env',
        '| ------- | ----- | -------------',
        '| Lambda | arm64 | ~$5',
        '| S3 | storage | ~$2',
        '| **Total** | | **~$7**',
        '',
      ].join('\n'),
    )
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, CANONICAL_COST_DOCS, errors)

    expect(errors).toEqual([])
  })

  it('parses thousands separators in canonical cost totals', () => {
    const dir = makeRepo(
      [
        '# Deployment Costs',
        '',
        '| Service | Est. $/mo/env |',
        '| - | - |',
        '| Large line | ~$1,200 |',
        '| Shared line | ~$50 |',
        '| **Total** | **~$1,250** |',
        '',
      ].join('\n'),
    )
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, CANONICAL_COST_DOCS, errors)

    expect(errors).toEqual([])
  })

  it('keeps escaped pipes in link text inside one canonical table cell', () => {
    const dir = makeRepo(
      [
        '# Deployment Costs',
        '',
        '| Service | Notes | Est. $/mo/env |',
        '| ------- | ----- | ------------- |',
        String.raw`| Lambda | [arm64 \| x86](https://example.com/compute) | ~$5 |`,
        '| S3 | storage | ~$2 |',
        '| **Total** | | **~$7** |',
        '',
      ].join('\n'),
    )
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, CANONICAL_COST_DOCS, errors)

    expect(errors).toEqual([])
  })

  it('reports and excludes extra-column canonical component rows from arithmetic', () => {
    const dir = makeRepo(
      [
        '# Deployment Costs',
        '',
        '| Service | Notes | Est. $/mo/env |',
        '| ------- | ----- | ------------- |',
        '| Lambda | arm64 | ~$99 | ignored |',
        '| S3 | storage | ~$2 |',
        '| **Total** | | **~$999** |',
        '',
      ].join('\n'),
    )
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, CANONICAL_COST_DOCS, errors)

    for (const file of CANONICAL_COST_DOCS)
      expect(errors).toContain(
        `::error file=${file},line=5::${file}: malformed cost table row; expected 3 columns but found 4`,
      )
  })

  it('reports extra-column canonical total rows without using them for arithmetic', () => {
    const dir = makeRepo(
      [
        '# Deployment Costs',
        '',
        '| Service | Notes | Est. $/mo/env |',
        '| ------- | ----- | ------------- |',
        '| Lambda | arm64 | ~$5 |',
        '| **Total** | | **~$5** | ignored |',
        '',
      ].join('\n'),
    )
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, CANONICAL_COST_DOCS, errors)

    for (const file of CANONICAL_COST_DOCS)
      expect(errors).toContain(
        `::error file=${file},line=6::${file}: malformed cost table row; expected 3 columns but found 4`,
      )
  })

  it('reports extra-column copied totals while still rejecting the copied table', () => {
    const dir = makeRepo(
      [
        '| Service | Est. $/mo/env |',
        '| ------- | ------------- |',
        '| Lambda | ~$5 |',
        '| **Total** | **~$5** |',
      ].join('\n'),
      [
        '[Deployment Costs](deployment-costs.md)',
        '',
        '| Service | Notes | Monthly estimate |',
        '| ------- | ----- | ---------------- |',
        '| **Total** | copied | **~$15** | ignored |',
        '',
      ].join('\n'),
    )
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, [...CANONICAL_COST_DOCS, INFRASTRUCTURE_DOC], errors)

    expect(errors).toContain(
      `::error file=${INFRASTRUCTURE_DOC},line=5::${INFRASTRUCTURE_DOC}: malformed cost table row; expected 3 columns but found 4`,
    )
    expect(errors).toContain(
      `::error file=${INFRASTRUCTURE_DOC},line=3::${INFRASTRUCTURE_DOC}: do not duplicate cost-total tables outside canonical cost table leaves`,
    )
  })

  it('rejects a copied Total table in the old deployment-costs index', () => {
    const dir = makeRepo(
      [
        '| Service | Est. $/mo/env |',
        '| ------- | ------------- |',
        '| Lambda | ~$5 |',
        '| **Total** | **~$5** |',
      ].join('\n'),
    )
    write(
      dir,
      OLD_COST_DOC,
      [
        '# Deployment Costs',
        '',
        '| Service | Monthly estimate |',
        '| ------- | ---------------- |',
        '| ECS | ~$15 |',
        '| **Total** | **~$15** |',
        '',
      ].join('\n'),
    )
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, [...CANONICAL_COST_DOCS, OLD_COST_DOC], errors)

    expect(errors).toContain(
      `::error file=${OLD_COST_DOC},line=3::${OLD_COST_DOC}: do not duplicate cost-total tables outside canonical cost table leaves`,
    )
  })
})
