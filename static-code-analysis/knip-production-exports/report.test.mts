import { describe, expect, it } from 'vitest'

import { knipJson, knipRow } from '../test-helpers/knip-production-exports/knip-json.mts'
import { compareFindings, KnipOutputError, parseKnipReport } from './report.mts'

describe('parseKnipReport', () => {
  it('turns exports and types into sorted rows without line numbers', () => {
    const findings = parseKnipReport(
      knipJson(
        { exports: ['zeta', 'alpha'], file: 'backend/b.mts', types: ['Shape'] },
        { exports: ['one'], file: 'backend/a.mts' },
      ),
    )
    expect(findings).toEqual([
      { file: 'backend/a.mts', symbol: 'one', type: 'exports' },
      { file: 'backend/b.mts', symbol: 'alpha', type: 'exports' },
      { file: 'backend/b.mts', symbol: 'zeta', type: 'exports' },
      { file: 'backend/b.mts', symbol: 'Shape', type: 'types' },
    ])
    expect(Object.keys(findings[0] ?? {}).toSorted()).toEqual(['file', 'symbol', 'type'])
  })

  it('reports no findings for an empty issue list', () => {
    expect(parseKnipReport('{"issues":[]}')).toEqual([])
  })

  it('ignores owners and empty arrays for other issue types', () => {
    const row = {
      ...knipRow({ exports: ['a'], file: 'backend/a.mts' }),
      owners: [{ name: '@team' }],
    }
    expect(parseKnipReport(JSON.stringify({ issues: [row] }))).toEqual([
      { file: 'backend/a.mts', symbol: 'a', type: 'exports' },
    ])
  })

  it('collapses a symbol that knip reports twice', () => {
    const findings = parseKnipReport(knipJson({ exports: ['same', 'same'], file: 'backend/a.mts' }))
    expect(findings).toHaveLength(1)
  })

  it('orders by code point, not by locale', () => {
    const findings = parseKnipReport(knipJson({ exports: ['b', 'B', 'a'], file: 'backend/a.mts' }))
    expect(findings.map(finding => finding.symbol)).toEqual(['B', 'a', 'b'])
    expect(compareFindings(findings[0]!, findings[0]!)).toBe(0)
  })

  it.each([
    ['empty output', ''],
    ['whitespace only', ' \n'],
    ['text that is not JSON', 'Error: boom'],
    ['a top-level array', '[]'],
    ['a report with extra keys', '{"issues":[],"hints":[]}'],
    ['issues that is not a list', '{"issues":{}}'],
    ['an issue row that is not an object', '{"issues":["backend/a.mts"]}'],
    ['an issue row without a file', '{"issues":[{"exports":[]}]}'],
  ])('fails loudly on %s', (_name, stdout) => {
    expect(() => parseKnipReport(stdout)).toThrow(KnipOutputError)
  })

  it.each([
    ['unused files', { files: [{ name: 'x' }] }, 'files in backend/a.mts'],
    ['unlisted dependencies', { unlisted: [{ name: 'x' }] }, 'unlisted in backend/a.mts'],
    ['enum members', { enumMembers: [{ name: 'A' }] }, 'enumMembers in backend/a.mts'],
    ['duplicate exports', { duplicates: [[{ name: 'a' }]] }, 'duplicates in backend/a.mts'],
    ['a field that is not a list', { files: false }, 'files in backend/a.mts'],
  ])('rejects %s instead of ignoring them', (_name, others, message) => {
    expect(() => parseKnipReport(knipJson({ file: 'backend/a.mts', others }))).toThrow(message)
  })

  it('rejects export entries without a symbol name', () => {
    const row = { ...knipRow({ file: 'backend/a.mts' }), exports: [{ line: 1 }] }
    expect(() => parseKnipReport(JSON.stringify({ issues: [row] }))).toThrow(
      'exports in backend/a.mts',
    )
  })

  it('names a bounded number of unsupported fields', () => {
    const issues = Array.from({ length: 12 }, (_, index) => ({
      file: `backend/f${index}.mts`,
      others: { unresolved: [{ name: 'x' }] },
    }))
    const failure = () => parseKnipReport(knipJson(...issues))
    expect(failure).toThrow('and 2 more')
    expect(failure).toThrow(/only exports and types/)
  })
})
