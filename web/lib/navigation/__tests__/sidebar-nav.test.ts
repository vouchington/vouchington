import { Headphones, Play } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { getNavIcon, isNavItemActive } from '../sidebar-nav'

describe('getNavIcon', () => {
  it('returns Headphones for /feed/podcasts', () => {
    expect(getNavIcon('/feed/podcasts')).toBe(Headphones)
  })

  it('returns Play for /feed/videos', () => {
    expect(getNavIcon('/feed/videos')).toBe(Play)
  })
})

describe('isNavItemActive', () => {
  it('/communities uses exact match — child path is not active', () => {
    expect(isNavItemActive('/communities', '/communities')).toBe(true)
    expect(isNavItemActive('/communities', '/communities/my-community')).toBe(false)
  })

  it('/news is active on sub-paths', () => {
    expect(isNavItemActive('/news', '/news')).toBe(true)
    expect(isNavItemActive('/news', '/news/article')).toBe(true)
  })

  it('default prefix matching: /foo active on /foo and /foo/bar', () => {
    expect(isNavItemActive('/foo', '/foo')).toBe(true)
    expect(isNavItemActive('/foo', '/foo/bar')).toBe(true)
  })

  it('exact=true: /foo NOT active on /foo/bar', () => {
    expect(isNavItemActive('/foo', '/foo', true)).toBe(true)
    expect(isNavItemActive('/foo', '/foo/bar', true)).toBe(false)
  })
})
