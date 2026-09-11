import { describe, expect, it } from 'vitest'
import { getRequestPath } from './app-guard-helpers.mts'

describe('getRequestPath', () => {
  it('strips the query string from an origin-form target', () => {
    expect(getRequestPath('/api/v1/foo?x=1&y=2')).toBe('/api/v1/foo')
  })

  it('extracts the pathname from an absolute-form target', () => {
    expect(getRequestPath('https://example.com/api/v1/foo?x=1')).toBe('/api/v1/foo')
  })

  it('falls back to "/" for a malformed absolute-form target', () => {
    expect(getRequestPath('http://[invalid')).toBe('/')
  })

  it('collapses every run of consecutive slashes', () => {
    expect(getRequestPath('//api//v1//')).toBe('/api/v1')
    expect(getRequestPath('/')).toBe('/')
    expect(getRequestPath('///')).toBe('/')
  })
})
