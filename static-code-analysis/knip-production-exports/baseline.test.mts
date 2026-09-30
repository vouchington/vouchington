import { describe, expect, it } from 'vitest'

import { BaselineError, diffFindings, parseBaseline, serializeBaseline } from './baseline.mts'
import type { Finding } from './report.mts'

const finding = (file: string, symbol: string, type: Finding['type'] = 'exports'): Finding => ({
  file,
  symbol,
  type,
})

describe('serializeBaseline', () => {
  it('groups by file and type, sorted, with no line numbers', () => {
    const text = serializeBaseline([
      finding('backend/b.mts', 'zeta'),
      finding('backend/a.mts', 'Shape', 'types'),
      finding('backend/b.mts', 'alpha'),
      finding('backend/a.mts', 'run'),
    ])
    expect(JSON.parse(text)).toEqual({
      'backend/a.mts': { exports: ['run'], types: ['Shape'] },
      'backend/b.mts': { exports: ['alpha', 'zeta'] },
    })
    expect(Object.keys(JSON.parse(text))).toEqual(['backend/a.mts', 'backend/b.mts'])
    expect(text.endsWith('\n')).toBe(true)
    expect(text).not.toMatch(/line|col|pos/)
  })

  it('is deterministic regardless of input order and repeats', () => {
    const findings = [finding('backend/a.mts', 'x'), finding('backend/a.mts', 'y')]
    expect(serializeBaseline(findings.toReversed())).toBe(serializeBaseline(findings))
    expect(serializeBaseline([...findings, findings[0]!])).toBe(serializeBaseline(findings))
  })

  it('serializes no findings as an empty object', () => {
    expect(serializeBaseline([])).toBe('{}\n')
  })
})

describe('parseBaseline', () => {
  it('reads back what serializeBaseline wrote', () => {
    const findings = [
      finding('backend/a.mts', 'Shape', 'types'),
      finding('backend/a.mts', 'run'),
      finding('backend/b.mts', 'go'),
    ]
    expect(parseBaseline(serializeBaseline(findings))).toEqual([
      finding('backend/a.mts', 'run'),
      finding('backend/a.mts', 'Shape', 'types'),
      finding('backend/b.mts', 'go'),
    ])
  })

  it.each([
    ['text that is not JSON', 'nope', 'not valid JSON'],
    ['an array', '[]', 'JSON object keyed by file'],
    ['null', 'null', 'JSON object keyed by file'],
    ['a file entry that is not an object', '{"a.mts":[]}', 'entry for a.mts'],
    ['an unknown issue type', '{"a.mts":{"files":["x"]}}', 'a.mts.files'],
    ['symbols that are not a list', '{"a.mts":{"exports":"x"}}', 'a.mts.exports'],
    ['a symbol that is not a string', '{"a.mts":{"exports":[1]}}', 'only list symbol names'],
  ])('rejects %s', (_name, text, message) => {
    expect(() => parseBaseline(text)).toThrow(BaselineError)
    expect(() => parseBaseline(text)).toThrow(message)
  })
})

describe('diffFindings', () => {
  it('reports new findings and stale baseline entries separately', () => {
    const kept = finding('backend/a.mts', 'kept')
    const diff = diffFindings(
      [kept, finding('backend/a.mts', 'fresh'), finding('backend/a.mts', 'kept', 'types')],
      [kept, finding('backend/b.mts', 'gone')],
    )
    expect(diff.added).toEqual([
      finding('backend/a.mts', 'fresh'),
      finding('backend/a.mts', 'kept', 'types'),
    ])
    expect(diff.removed).toEqual([finding('backend/b.mts', 'gone')])
  })

  it('reports nothing when both sides match', () => {
    const findings = [finding('backend/a.mts', 'x')]
    expect(diffFindings(findings, findings)).toEqual({ added: [], removed: [] })
  })
})
