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
const OLD_MONOLITH = 'docs/overview/infrastructure/deployment-costs.md'
const COST_SUMMARY_DOCS = [
  'docs/overview/infrastructure/infrastructure.md',
  'docs/overview/infrastructure/networking.md',
] as const
const TRACKED_FILES = [...CANONICAL_COST_DOCS, ...COST_SUMMARY_DOCS] as const
type RepoFile = (typeof TRACKED_FILES)[number] | typeof OLD_MONOLITH

function write(repoRoot: string, path: string, content: string): void {
  mkdirSync(dirname(join(repoRoot, path)), { recursive: true })
  writeFileSync(join(repoRoot, path), content)
}

function summaryDoc(): string {
  return '[Deployment Costs](deployment-costs.md)\n'
}

function canonicalDoc(total = '~$12/env'): string {
  return [
    '# Deployment Costs',
    '',
    '| Service | Notes | Est. $/mo/env |',
    '| ------- | ----- | ------------- |',
    '| Lambda | arm64 | ~$1 |',
    '| CloudFront | low egress | ~$1 |',
    '| S3 | low storage | ~$1 |',
    '| Firehose | ingestion | usage-metered |',
    '| SES | email | ~$1 |',
    '| GuardDuty | enabled | ~$2 |',
    '| CloudWatch | logs | ~$2 |',
    '| KMS | keys | ~$2 |',
    '| Secrets | secrets | ~$2 |',
    `| **Total** | | **${total}** |`,
    '',
  ].join('\n')
}

function makeRepo(files: Partial<Record<RepoFile, string | null>> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'voucha-cost-table-'))
  for (const file of CANONICAL_COST_DOCS) {
    const content = Object.hasOwn(files, file) ? files[file] : canonicalDoc()
    if (content !== null && content !== undefined) write(dir, file, content)
  }
  for (const file of COST_SUMMARY_DOCS) {
    const content = Object.hasOwn(files, file) ? files[file] : summaryDoc()
    if (content !== null && content !== undefined) write(dir, file, content)
  }
  const monolith = files[OLD_MONOLITH]
  if (monolith !== null && monolith !== undefined) write(dir, OLD_MONOLITH, monolith)
  return dir
}

describe('checkCostTableConsistencyGuard', () => {
  const testDirs: string[] = []

  afterEach(() => {
    for (const dir of testDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  it.each(CANONICAL_COST_DOCS)('validates the canonical table in %s', file => {
    const dir = makeRepo()
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toEqual([])
    expect(CANONICAL_COST_DOCS).toContain(file)
  })

  it('names the owning canonical file when its arithmetic does not match', () => {
    const file = CANONICAL_COST_DOCS[1]
    const dir = makeRepo({ [file]: canonicalDoc('~$11/env') })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toContain(
      `::error file=${file},line=3::${file}: cost table total mismatch; expected $12 from rows but found $11`,
    )
  })

  it('supports staging and production total ranges in canonical tables', () => {
    const file = CANONICAL_COST_DOCS[1]
    const dir = makeRepo({
      [file]: [
        '# Deployment Costs',
        '',
        '| Service | Est. $/mo/env |',
        '| ------- | ------------- |',
        '| ECS | ~$15-30 staging / ~$30-50 production |',
        '| Shared | ~$6 |',
        '| **Total** | **~$21-36 staging / ~$36-56 production** |',
        '',
      ].join('\n'),
    })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toEqual([])
  })

  it('treats scenario-qualified less-than costs as zero-to-value ranges', () => {
    const file = CANONICAL_COST_DOCS[2]
    const dir = makeRepo({
      [file]: [
        '# Deployment Costs',
        '',
        '| Service | Est. $/mo/env |',
        '| - | - |',
        '| Variable line | <$5 staging / ~$5 production |',
        '| Fixed line | ~$10 |',
        '| _*Total*_ | _~$10-15 staging / ~$15 production_ |',
        '',
      ].join('\n'),
    })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toEqual([])
  })

  it('does not match a total-like canonical table header as the total row', () => {
    const file = CANONICAL_COST_DOCS[0]
    const dir = makeRepo({
      [file]: [
        '# Deployment Costs',
        '',
        '| Total service | Est. $/mo/env |',
        '| --- | --- |',
        '| Lambda | ~$1 |',
        '| **Total** | **~$1** |',
        '',
      ].join('\n'),
    })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toEqual([])
  })

  it('reports malformed canonical rows without using them for arithmetic', () => {
    const file = CANONICAL_COST_DOCS[0]
    const dir = makeRepo({
      [file]: [
        '# Deployment Costs',
        '',
        '| Service | Notes | Est. $/mo/env |',
        '| ------- | ----- | ------------- |',
        '| Lambda | arm64 | ~$99 | ignored |',
        '| S3 | storage | ~$2 |',
        '| **Total** | | **~$999** |',
        '',
      ].join('\n'),
    })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toEqual([
      `::error file=${file},line=5::${file}: malformed cost table row; expected 3 columns but found 4`,
    ])
  })

  it('requires a canonical leaf that is tracked but missing from disk', () => {
    const file = CANONICAL_COST_DOCS[2]
    const dir = makeRepo({ [file]: null })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toContain(
      `::error file=${file}::${file}: canonical cost table is tracked but missing or unreadable`,
    )
  })

  it('requires a Total row in every canonical leaf', () => {
    const file = CANONICAL_COST_DOCS[1]
    const dir = makeRepo({ [file]: '# No table\n' })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toContain(
      `::error file=${file}::${file}: canonical cost table must contain a Total row`,
    )
  })

  it('does not let an untracked physical canonical leaf satisfy the guard', () => {
    const file = CANONICAL_COST_DOCS[0]
    const dir = makeRepo()
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(
      dir,
      TRACKED_FILES.filter(trackedFile => trackedFile !== file),
      errors,
    )

    expect(errors).toContain(`::error file=${file}::${file}: canonical cost table must be tracked`)
  })

  it('does not let the old monolith satisfy the canonical-table requirement', () => {
    const dir = makeRepo({ [OLD_MONOLITH]: canonicalDoc() })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, [OLD_MONOLITH], errors)

    for (const file of CANONICAL_COST_DOCS)
      expect(errors).toContain(
        `::error file=${file}::${file}: canonical cost table must be tracked`,
      )
  })

  it('does nothing when no canonical or summary anchor is tracked', () => {
    const dir = makeRepo()
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, [], errors)

    expect(errors).toEqual([])
  })

  it('checks summary links even when canonical leaves are missing', () => {
    const dir = makeRepo({
      [CANONICAL_COST_DOCS[0]]: null,
      'docs/overview/infrastructure/infrastructure.md': 'Cost summary lives elsewhere.\n',
    })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors.some(error => error.includes('link to canonical cost doc'))).toBe(true)
  })

  it('rejects copied cost-total tables in summary documents', () => {
    const file = 'docs/overview/infrastructure/infrastructure.md'
    const dir = makeRepo({
      [file]: [
        '[Deployment Costs](deployment-costs.md)',
        '',
        '| Service | Monthly estimate |',
        '| ------- | ---------------- |',
        '| ECS | ~$15 |',
        '| **Total** | **~$15** |',
        '',
      ].join('\n'),
    })
    testDirs.push(dir)
    const errors: string[] = []

    checkCostTableConsistencyGuard(dir, TRACKED_FILES, errors)

    expect(errors).toContain(
      `::error file=${file},line=3::${file}: do not duplicate cost-total tables outside canonical cost table leaves`,
    )
  })
})
