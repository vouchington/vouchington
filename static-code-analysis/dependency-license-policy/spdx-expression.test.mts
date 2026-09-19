import { describe, expect, it } from 'vitest'

import {
  collectSpdxAtoms,
  evaluateSpdxExpression,
  parseSpdxExpression,
} from './spdx-expression.mts'

describe('parseSpdxExpression', () => {
  it('parses a single license id', () => {
    expect(parseSpdxExpression('MIT')).toEqual({ type: 'ATOM', id: 'MIT' })
  })

  it('parses an unparenthesized OR', () => {
    expect(parseSpdxExpression('MIT OR Apache-2.0')).toEqual({
      type: 'OR',
      children: [
        { type: 'ATOM', id: 'MIT' },
        { type: 'ATOM', id: 'Apache-2.0' },
      ],
    })
  })

  it('parses a parenthesized OR identically to unparenthesized', () => {
    expect(parseSpdxExpression('(MIT OR Apache-2.0)')).toEqual(
      parseSpdxExpression('MIT OR Apache-2.0'),
    )
  })

  it('parses AND', () => {
    expect(parseSpdxExpression('MIT AND ISC')).toEqual({
      type: 'AND',
      children: [
        { type: 'ATOM', id: 'MIT' },
        { type: 'ATOM', id: 'ISC' },
      ],
    })
  })

  it('parses nested AND-inside-OR with explicit grouping', () => {
    const tree = parseSpdxExpression('(MIT AND ISC) OR Apache-2.0')
    expect(tree).toEqual({
      type: 'OR',
      children: [
        {
          type: 'AND',
          children: [
            { type: 'ATOM', id: 'MIT' },
            { type: 'ATOM', id: 'ISC' },
          ],
        },
        { type: 'ATOM', id: 'Apache-2.0' },
      ],
    })
  })

  it('keeps a trailing + suffix on the atom', () => {
    expect(parseSpdxExpression('GPL-2.0+')).toEqual({ type: 'ATOM', id: 'GPL-2.0+' })
  })

  it('keeps a recognized SPDX exception on the atom', () => {
    expect(parseSpdxExpression('GPL-2.0-only WITH Classpath-exception-2.0')).toEqual({
      type: 'ATOM',
      id: 'GPL-2.0-only WITH Classpath-exception-2.0',
    })
  })

  it('rejects an empty string', () => {
    expect(() => parseSpdxExpression('')).toThrow('Invalid SPDX license expression')
  })

  it('rejects unknown license and exception identifiers', () => {
    expect(() => parseSpdxExpression('Proprietary')).toThrow('Invalid SPDX license expression')
    expect(() => parseSpdxExpression('MIT WITH Made-Up-Exception')).toThrow(
      'Invalid SPDX license expression',
    )
  })

  it('rejects custom SPDX license references, including inside an otherwise clean OR', () => {
    expect(() => parseSpdxExpression('LicenseRef-Proprietary')).toThrow(
      'Custom SPDX license references are not allowed',
    )
    expect(() => parseSpdxExpression('DocumentRef-vendor:LicenseRef-Proprietary')).toThrow(
      'Custom SPDX license references are not allowed',
    )
    expect(() => parseSpdxExpression('MIT OR LicenseRef-Proprietary')).toThrow(
      'Custom SPDX license references are not allowed',
    )
  })

  it('throws on unbalanced parentheses', () => {
    expect(() => parseSpdxExpression('(MIT OR Apache-2.0')).toThrow(
      'Invalid SPDX license expression',
    )
  })

  it('throws on a dangling operator', () => {
    expect(() => parseSpdxExpression('MIT OR')).toThrow('Invalid SPDX license expression')
  })

  it('throws on unexpected trailing tokens', () => {
    expect(() => parseSpdxExpression('MIT Apache-2.0')).toThrow('Invalid SPDX license expression')
  })
})

describe('evaluateSpdxExpression', () => {
  const allowOnly = (allowed: string) => (atomId: string) => atomId === allowed

  it('ATOM: delegates directly to isAtomOk', () => {
    const node = parseSpdxExpression('MIT')
    expect(evaluateSpdxExpression(node, allowOnly('MIT'))).toBe(true)
    expect(evaluateSpdxExpression(node, allowOnly('ISC'))).toBe(false)
  })

  it('OR: clean if any branch is clean', () => {
    const node = parseSpdxExpression('GPL-3.0-only OR MIT')
    expect(evaluateSpdxExpression(node, allowOnly('MIT'))).toBe(true)
  })

  it('OR: unclean if every branch is unclean', () => {
    const node = parseSpdxExpression('GPL-3.0-only OR AGPL-3.0-only')
    expect(evaluateSpdxExpression(node, allowOnly('MIT'))).toBe(false)
  })

  it('AND: unclean if any branch is unclean, even when another branch is clean', () => {
    const node = parseSpdxExpression('MIT AND GPL-3.0-only')
    expect(evaluateSpdxExpression(node, allowOnly('MIT'))).toBe(false)
  })

  it('AND: clean only when every branch is clean', () => {
    const node = parseSpdxExpression('MIT AND ISC')
    expect(evaluateSpdxExpression(node, () => true)).toBe(true)
  })
})

describe('collectSpdxAtoms', () => {
  it('flattens every atom out of a compound tree', () => {
    const node = parseSpdxExpression('(MIT AND ISC) OR GPL-3.0-only')
    expect(collectSpdxAtoms(node)).toEqual(['MIT', 'ISC', 'GPL-3.0-only'])
  })

  it('returns a single-element array for a bare atom', () => {
    expect(collectSpdxAtoms(parseSpdxExpression('MIT'))).toEqual(['MIT'])
  })
})
