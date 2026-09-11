import { describe, expect, it } from 'vitest'
import { listHref } from '../entity-href'

describe('listHref', () => {
  it('builds /list/{id} from an object', () => {
    expect(listHref({ id: 'abc123' })).toBe('/list/abc123')
  })
  it('builds /list/{id} from a string', () => {
    expect(listHref('xyz456')).toBe('/list/xyz456')
  })
})
