import { describe, expect, it } from 'vitest'
import { formatUnknownValue } from './format-unknown-value'

// oxlint-disable-next-line unicorn/prefer-bigint-literals -- Web targets ES2019, which cannot emit bigint literals.
const bigIntTwelve = BigInt(12)

describe('formatUnknownValue', () => {
  it('keeps primitive text readable', () => {
    expect(formatUnknownValue('ready')).toBe('ready')
    expect(formatUnknownValue(4)).toBe('4')
    expect(formatUnknownValue(undefined)).toBe('undefined')
    expect(formatUnknownValue(bigIntTwelve)).toBe('12')
  })

  it('serializes nested objects without Object default stringification', () => {
    expect(formatUnknownValue({ nested: [1, { ready: true }] })).toBe(
      '{"nested":[1,{"ready":true}]}',
    )
  })

  it('handles cycles and values whose JSON serializer throws', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(formatUnknownValue(cycle)).toBe('{"self":"[Circular]"}')
    expect(
      formatUnknownValue({
        toJSON: () => {
          throw new Error('bad serializer')
        },
      }),
    ).toBe('[Unserializable object]')
  })

  it('does not mistake a repeated sibling reference for a cycle', () => {
    const shared = { value: 1 }
    expect(formatUnknownValue({ first: shared, second: shared })).toBe(
      '{"first":{"value":1},"second":{"value":1}}',
    )
  })

  it('formats nested bigint values without throwing', () => {
    expect(formatUnknownValue({ count: bigIntTwelve })).toBe('{"count":"12"}')
  })
})
