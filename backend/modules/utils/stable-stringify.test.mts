import { describe, expect, it } from 'vitest'
import { stableStringify } from './stable-stringify.mts'

describe('stableStringify', () => {
  it('sorts object keys alphabetically', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}\n')
  })

  it('normalizes JSON-compatible values before stable formatting', () => {
    expect(
      stableStringify({
        z: undefined,
        date: new Date('2026-06-28T00:00:00.000Z'),
        array: [undefined, new Date('2026-06-29T00:00:00.000Z')],
        object: { keep: true, omit: undefined },
      }),
    ).toBe(`{
  "array": [null, "2026-06-29T00:00:00.000Z"],
  "date": "2026-06-28T00:00:00.000Z",
  "object": {
    "keep": true
  }
}
`)
  })

  it('inlines scalar arrays within the repository print width', () => {
    const json = stableStringify({
      fixtureIds: ['native.dynamic-config.update.changed', 'native.dynamic-config.update.no-op'],
    })
    expect(json).toContain(
      '"fixtureIds": ["native.dynamic-config.update.changed", "native.dynamic-config.update.no-op"]',
    )
  })

  it('wraps scalar arrays that exceed the print width one item per line', () => {
    const json = stableStringify({
      names: [
        'a-very-long-value-that-pushes-this-array-past-the-inline-width-threshold',
        'another-very-long-value-that-pushes-this-array-past-the-inline-width-threshold',
      ],
    })
    expect(json).toBe(`{
  "names": [
    "a-very-long-value-that-pushes-this-array-past-the-inline-width-threshold",
    "another-very-long-value-that-pushes-this-array-past-the-inline-width-threshold"
  ]
}
`)
  })

  it('renders empty arrays and objects inline', () => {
    expect(stableStringify({ list: [], nested: {} })).toBe('{\n  "list": [],\n  "nested": {}\n}\n')
  })

  it('emits valid JSON when values contain functions or symbols', () => {
    expect(
      JSON.parse(
        stableStringify({
          array: [Symbol('value'), () => undefined],
          omitFunction: () => undefined,
          omitSymbol: Symbol('value'),
        }),
      ),
    ).toEqual({ array: [null, null] })
  })
})
