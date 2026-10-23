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

// Pure consumer policy: no query execution, provider mocks or dependency implementation tests.
describe('route-scoped repeated-query allowances', () => {
  it('accepts the same annotation on distinct explicit routes with independent bounds', () => {
    const entries = [
      { ...temporary, route: firstRoute, maxCount: 2 },
      { ...permanent, route: secondRoute, maxCount: 3 },
    ]
    expect(parseRepeatBaseline(entries)).toEqual(entries)
  })

  it.each([false, true])(
    'rejects duplicate annotation/route pairs across metadata kinds (reverse=%s)',
    reverse => {
      const entries = [
        { ...temporary, route: firstRoute, maxCount: 2 },
        { ...permanent, route: firstRoute, maxCount: 3 },
      ]
      expect(() => parseRepeatBaseline(reverse ? entries.toReversed() : entries)).toThrow(
        'duplicate',
      )
    },
  )

  it('rejects duplicate global entries', () => {
    expect(() =>
      parseRepeatBaseline([
        { ...temporary, route: null, maxCount: null },
        { ...permanent, route: null, maxCount: null },
      ]),
    ).toThrow('duplicate')
  })

  it.each([false, true])(
    'rejects overlap between global and explicit route allowances (globalFirst=%s)',
    globalFirst => {
      const global = { ...temporary, route: null, maxCount: null }
      const scoped = { ...permanent, route: firstRoute, maxCount: 2 }
      expect(() => parseRepeatBaseline(globalFirst ? [global, scoped] : [scoped, global])).toThrow(
        'overlap',
      )
    },
  )

  it('rejects a global allowance after several distinct scoped entries', () => {
    expect(() =>
      parseRepeatBaseline([
        { ...temporary, route: firstRoute, maxCount: 2 },
        { ...permanent, route: secondRoute, maxCount: 3 },
        { ...temporary, route: null, maxCount: null },
      ]),
    ).toThrow('overlap')
  })

  it.each([false, true])(
    'uses only the matching route bound regardless of entry order (reverse=%s)',
    reverse => {
      const entries = [
        { ...temporary, route: firstRoute, maxCount: 2 },
        { ...permanent, route: secondRoute, maxCount: 3 },
        { ...permanent, annotation: 'globalRepeat', route: null, maxCount: null },
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
      expect(
        findUnbaselinedRepeats(firstRoute, [{ annotation: 'globalRepeat', count: 20 }], baseline),
      ).toEqual([])
      expect(
        findUnbaselinedRepeats(secondRoute, [{ annotation: 'globalRepeat', count: 20 }], baseline),
      ).toEqual([])
    },
  )
})
