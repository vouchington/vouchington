import { describe, expect, it } from 'vitest'
import { FETCH_FORBIDDEN_PORTS, isFetchForbiddenPort, isFetchSafePort } from './fetch-ports.mts'

describe('Fetch port policy', () => {
  it('classifies canonical forbidden and safe ports', () => {
    expect(isFetchForbiddenPort(1)).toBe(true)
    expect(isFetchForbiddenPort(4045)).toBe(true)
    expect(isFetchForbiddenPort(4190)).toBe(true)
    expect(isFetchForbiddenPort(6667)).toBe(true)
    expect(isFetchForbiddenPort(6679)).toBe(true)
    expect(isFetchForbiddenPort(10_080)).toBe(true)
    expect(isFetchSafePort(4046)).toBe(true)
    expect(isFetchSafePort(49_152)).toBe(true)
  })

  it('exports a frozen, sorted, unique list of integer ports', () => {
    expect(Object.isFrozen(FETCH_FORBIDDEN_PORTS)).toBe(true)
    expect(FETCH_FORBIDDEN_PORTS.every(Number.isInteger)).toBe(true)
    expect(FETCH_FORBIDDEN_PORTS).toEqual([...FETCH_FORBIDDEN_PORTS].toSorted((a, b) => a - b))
    expect(new Set(FETCH_FORBIDDEN_PORTS).size).toBe(FETCH_FORBIDDEN_PORTS.length)
  })
})
