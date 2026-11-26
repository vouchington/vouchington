import { describe, expect, it } from 'vitest'
import { cookieOrigin } from '../cookie-origin.mts'

describe('cookieOrigin', () => {
  it('returns the origin of the project baseURL', () => {
    const info = () => ({ project: { use: { baseURL: 'https://localhost:8787/some/path' } } })
    expect(cookieOrigin(info)).toBe('https://localhost:8787')
  })

  it('throws when the project has no baseURL', () => {
    expect(() => cookieOrigin(() => ({ project: { use: {} } }))).toThrow('no baseURL')
  })
})
