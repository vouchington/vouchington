import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRepeatBaseline } from 'vouchington-tooling/request-query-profile'

const BASELINE_URL = new URL(
  '../../test-helpers/api/request-query-profile-baseline.json',
  import.meta.url,
)
describe('committed request query profile baseline', () => {
  it('validates the committed baseline and the locations its code pointers name', () => {
    const entries = parseRepeatBaseline(JSON.parse(readFileSync(BASELINE_URL, 'utf8')))
    const bad = entries.flatMap(entry => {
      if (!('code' in entry)) return []
      const split = entry.code.lastIndexOf(':')
      const target = entry.code.slice(split + 1)
      const url = new URL(`../../../${entry.code.slice(0, split)}`, import.meta.url)
      if (!existsSync(url)) return [entry.code]
      const source = readFileSync(url, 'utf8')
      const found = /^\d/.test(target)
        ? Number(target.split('-').at(-1)) <= source.split('\n').length
        : source.includes(target.split('.').at(-1)!)
      return found ? [] : [entry.code]
    })
    expect(bad).toEqual([])
  })
})
