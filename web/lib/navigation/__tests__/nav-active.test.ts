import { describe, expect, it } from 'vitest'
import { NAV_INTENTS } from '../intents'
import { isNavItemActive } from '../sidebar-nav'
import { isActivePath } from '@/lib/utils/path'

describe('isActivePath', () => {
  it('matches "/" exactly, not sub-paths', () => {
    expect(isActivePath('/', '/')).toBe(true)
    expect(isActivePath('/foo', '/')).toBe(false)
  })

  it('matches "/foo" and "/foo/bar" but not "/foobar" or "/fo"', () => {
    expect(isActivePath('/foo', '/foo')).toBe(true)
    expect(isActivePath('/foo/bar', '/foo')).toBe(true)
    expect(isActivePath('/foobar', '/foo')).toBe(false)
    expect(isActivePath('/fo', '/foo')).toBe(false)
  })

  it('matches "/foo/bar" and "/foo/bar/baz" but not "/foo"', () => {
    expect(isActivePath('/foo/bar', '/foo/bar')).toBe(true)
    expect(isActivePath('/foo/bar/baz', '/foo/bar')).toBe(true)
    expect(isActivePath('/foo', '/foo/bar')).toBe(false)
  })
})

describe('isNavItemActive — exact flag', () => {
  it('exact=false (default): parent href active on exact and child paths', () => {
    expect(isNavItemActive('/foo', '/foo')).toBe(true)
    expect(isNavItemActive('/foo', '/foo/bar')).toBe(true)
  })

  it('exact=true: parent href active only on exact path, not child', () => {
    expect(isNavItemActive('/foo', '/foo', true)).toBe(true)
    expect(isNavItemActive('/foo', '/foo/bar', true)).toBe(false)
  })
})

describe('isNavItemActive — excludePathPrefixes', () => {
  it('excludes paths that start with a listed prefix (segment boundary)', () => {
    expect(isNavItemActive('/foo', '/foo/bar', false, ['/foo/bar'])).toBe(false)
    expect(isNavItemActive('/foo', '/foo/baz', false, ['/foo/bar'])).toBe(true)
  })

  it('excludes exact prefix match', () => {
    expect(isNavItemActive('/foo', '/foo/bar', false, ['/foo/bar'])).toBe(false)
  })

  it('excludes prefix with child path', () => {
    expect(isNavItemActive('/foo', '/foo/bar/baz', false, ['/foo/bar'])).toBe(false)
  })

  it('does not exclude a path that merely starts with the same characters (no segment boundary)', () => {
    expect(isNavItemActive('/foo', '/foo/barbaz', false, ['/foo/bar'])).toBe(true)
  })

  it('allows the item itself when not matching any excluded prefix', () => {
    expect(isNavItemActive('/foo', '/foo', false, ['/foo/bar'])).toBe(true)
  })
})

describe('sidebar invariant: at most one active item per intent', () => {
  for (const intent of NAV_INTENTS) {
    describe(`intent "${intent.id}"`, () => {
      const items = intent.groups.flatMap(g => g.items)

      for (const item of items) {
        it(`"${item.label}" (${item.href}) is the only active item on its own path`, () => {
          const pathname = item.href
          const active = items.filter(i =>
            isNavItemActive(i.href, pathname, i.exact, i.excludePathPrefixes),
          )
          expect(active).toHaveLength(1)
          expect(active[0]).toBe(item)
        })

        it(`at most one item is active on "${item.href}/some-child-path"`, () => {
          const pathname = `${item.href}/some-child-path`
          const activeCount = items.filter(i =>
            isNavItemActive(i.href, pathname, i.exact, i.excludePathPrefixes),
          ).length
          expect(activeCount).toBeLessThanOrEqual(1)
        })
      }
    })
  }
})
