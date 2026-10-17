import { describe, expect, it } from 'vitest'
import { getOptionOutputSchema, validateOptionOutputPointers } from './option-output-pointers.mts'

const input = { oneOf: [{ properties: { option: { enum: ['get'] } } }] }
const output = { type: 'object', $defs: { Value: { type: 'string' } } }

describe('selected output pointer publication', () => {
  it('keeps the complete root and definitions for a collapsed output', () => {
    expect(() => validateOptionOutputPointers('read', input, output, { get: '#' })).not.toThrow()
    expect(getOptionOutputSchema(output, '#')).toBe(output)
    expect(() => getOptionOutputSchema(output, '#/anyOf/0')).toThrow(
      'Invalid selected output pointer',
    )
  })

  it.each([
    {},
    { oneOf: [] },
    { oneOf: [{ properties: { option: { type: 'string' } } }] },
    { oneOf: [{ properties: { option: { enum: ['get', 'list'] } } }] },
  ])('refuses metadata without exact literal input options: %j', schema => {
    expect(() => validateOptionOutputPointers('read', schema, output, { get: '#' })).toThrow(
      'literal input options',
    )
  })

  it('refuses a missing output contract and non-schema targets', () => {
    expect(() => validateOptionOutputPointers('read', input, undefined, { get: '#' })).toThrow(
      'does not resolve',
    )
    expect(() =>
      validateOptionOutputPointers('read', input, { anyOf: [false] }, { get: '#/anyOf/0' }),
    ).toThrow('does not resolve')
  })
})
