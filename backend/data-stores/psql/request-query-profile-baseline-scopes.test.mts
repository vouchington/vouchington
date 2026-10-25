import { describe, expect, it } from 'vitest'
import {
  findUnbaselinedRepeats,
  parseRepeatBaseline,
} from '../../test-helpers/request-query-profile-baseline.mts'

const temporary = {
  annotation: 'readAuthority',
  reason: 'repeat owned by the open issue',
  issue: 1,
}
const permanent = {
  annotation: 'readAuthority',
  reason: 'locked admission rereads the current authority',
  permanent: true as const,
  code: 'backend/services/jwt-session/device-authority.mts:readSessionDeviceAuthority',
}
const firstRoute = 'POST /api/v1/example/first'
const secondRoute = 'POST /api/v1/example/second'
const worker = { queue: 'example-queue', job: 'example-job' }

describe('route-scoped repeated-query allowances', () => {
  it('accepts the same annotation on distinct explicit routes with independent bounds', () => {
    const entries = [
      { ...temporary, routes: [firstRoute], maxCount: 2 },
      { ...permanent, routes: [secondRoute], maxCount: 3 },
    ]
    expect(parseRepeatBaseline(entries)).toEqual(entries)
  })

  it.each([false, true])(
    'rejects duplicate annotation/route pairs across metadata kinds (reverse=%s)',
    reverse => {
      const entries = [
        { ...temporary, routes: [firstRoute], maxCount: 2 },
        { ...permanent, routes: [firstRoute], maxCount: 3 },
      ]
      expect(() => parseRepeatBaseline(reverse ? entries.toReversed() : entries)).toThrow(
        'duplicate',
      )
    },
  )

  it('rejects duplicate routes within one entry', () => {
    expect(() =>
      parseRepeatBaseline([{ ...permanent, routes: [firstRoute, firstRoute], maxCount: 2 }]),
    ).toThrow('duplicate')
  })

  it('rejects duplicate worker scopes across entries', () => {
    expect(() =>
      parseRepeatBaseline([
        { ...temporary, routes: [], workers: [worker], maxCount: 2 },
        { ...permanent, routes: [], workers: [worker], maxCount: 3 },
      ]),
    ).toThrow('duplicate')
  })

  it('allows the same annotation on distinct route and worker scopes', () => {
    expect(
      parseRepeatBaseline([
        { ...temporary, routes: [firstRoute], maxCount: 2 },
        { ...permanent, routes: [], workers: [worker], maxCount: 3 },
      ]),
    ).toHaveLength(2)
  })

  it.each([false, true])(
    'uses only the matching route bound regardless of entry order (reverse=%s)',
    reverse => {
      const entries = [
        { ...temporary, routes: [firstRoute], maxCount: 2 },
        { ...permanent, routes: [secondRoute], maxCount: 3 },
      ]
      const baseline = parseRepeatBaseline(reverse ? entries.toReversed() : entries)
      const two = [{ annotation: 'readAuthority', count: 2 }]
      const three = [{ annotation: 'readAuthority', count: 3 }]
      const four = [{ annotation: 'readAuthority', count: 4 }]
      expect(findUnbaselinedRepeats(firstRoute, two, baseline)).toEqual([])
      expect(findUnbaselinedRepeats(firstRoute, three, baseline)).toEqual(three)
      expect(findUnbaselinedRepeats(secondRoute, three, baseline)).toEqual([])
      expect(findUnbaselinedRepeats(secondRoute, four, baseline)).toEqual(four)
      expect(findUnbaselinedRepeats('GET /api/v1/example/first', two, baseline)).toEqual(two)
      expect(findUnbaselinedRepeats(`${firstRoute}/extra`, two, baseline)).toEqual(two)
      expect(findUnbaselinedRepeats('POST /api/v1/example/third', two, baseline)).toEqual(two)
    },
  )
})
