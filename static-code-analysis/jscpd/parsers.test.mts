import { describe, expect, it } from 'vitest'
import { findConfigGlobProblems, readIgnoreGlobs, untrackedIgnoreGlobs } from './ignore-globs.mts'
import { formatClone, parseJscpdReport } from './report.mts'
import { reportJson } from '../test-helpers/jscpd-fake-repo.mts'

describe('readIgnoreGlobs', () => {
  it('reads the ignore list and treats a missing list as empty', () => {
    expect(readIgnoreGlobs('{"ignore":["**/a/**"]}')).toEqual(['**/a/**'])
    expect(readIgnoreGlobs('{"format":["typescript"]}')).toEqual([])
  })

  it('rejects a config that is not an object or an ignore list that is not strings', () => {
    expect(() => readIgnoreGlobs('[]')).toThrow('.jscpd.json must contain a JSON object')
    expect(() => readIgnoreGlobs('{"ignore":"**/a/**"}')).toThrow('must be an array of strings')
    expect(() => readIgnoreGlobs('{"ignore":["**/a/**",1]}')).toThrow('must be an array of strings')
  })
})

describe('findConfigGlobProblems', () => {
  it('accepts a **/ glob that matches a tracked file at the root or nested', () => {
    expect(findConfigGlobProblems(['**/scripts/seeds/**'], ['scripts/seeds/a.ts'])).toEqual([])
    expect(findConfigGlobProblems(['**/scripts/seeds/**'], ['backend/scripts/seeds/a.ts'])).toEqual(
      [],
    )
    expect(findConfigGlobProblems(['**/*.d.ts'], ['web/next-env.d.ts'])).toEqual([])
  })

  it('does not count a directory-name prefix as a match', () => {
    expect(findConfigGlobProblems(['**/seeds/**'], ['backend/seeds-old/a.ts'])).toEqual([
      '.jscpd.json ignore glob "**/seeds/**" matches no tracked file; delete it and its README row.',
    ])
  })
})

describe('untrackedIgnoreGlobs', () => {
  it('anchors each path to the scan root and escapes glob metacharacters', () => {
    expect(untrackedIgnoreGlobs(['a.ts', 'b/[slug]/*?.ts', 'c\\d.ts', 'e/{x}.ts'])).toEqual([
      './a.ts',
      './b/\\[slug\\]/\\*\\?.ts',
      './c\\\\d.ts',
      './e/\\{x\\}.ts',
    ])
  })

  it('ignores everything under an untracked nested repository', () => {
    expect(untrackedIgnoreGlobs(['vendor/checkout/'])).toEqual(['./vendor/checkout/**'])
  })
})

describe('parseJscpdReport', () => {
  it('keeps kind verbatim so new jscpd clone kinds still print', () => {
    const report = parseJscpdReport(
      reportJson([{ isNew: true, kind: 'renamed', first: 'a.ts:1-5', second: 'b.ts:2-6' }]),
    )
    expect(report.sources).toBe(3)
    expect(report.clones.map(formatClone)).toEqual(['renamed a.ts:1-5 ~ b.ts:2-6 (5 lines)'])
  })

  it('fails loudly when a clone lacks the isNew flag the gate depends on', () => {
    const report = JSON.parse(reportJson([{ isNew: true, first: 'a.ts', second: 'b.ts' }]))
    delete report.duplicates[0].isNew
    expect(() => parseJscpdReport(JSON.stringify(report))).toThrow(
      'Unexpected jscpd-report.json shape: duplicates[0].isNew must be a boolean',
    )
  })

  it('rejects malformed locations, counts, and statistics', () => {
    const valid = JSON.parse(reportJson([{ isNew: false, first: 'a.ts', second: 'b.ts' }]))
    const cases: [(report: typeof valid) => void, string][] = [
      [report => (report.duplicates[0].firstFile.name = ''), 'duplicates[0].firstFile.name'],
      [report => (report.duplicates[0].secondFile.start = '1'), 'duplicates[0].secondFile.start'],
      [report => (report.duplicates[0].lines = 1.5), 'duplicates[0].lines'],
      [report => (report.duplicates[0].kind = undefined), 'duplicates[0].kind'],
      [report => (report.duplicates = {}), 'duplicates must be an array'],
      [report => delete report.statistics.total, 'statistics.total must be an object'],
    ]
    for (const [mutate, message] of cases) {
      const report = structuredClone(valid)
      mutate(report)
      expect(() => parseJscpdReport(JSON.stringify(report))).toThrow(message)
    }
  })
})
