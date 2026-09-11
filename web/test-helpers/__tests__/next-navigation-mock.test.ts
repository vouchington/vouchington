import { describe, expect, it, beforeEach } from 'vitest'
import { navMockModule, createNavMock } from '../next-navigation-mock'

/**
 * Tests for the shared navigation mock helper.
 *
 * Note: `navMockModule` is a singleton backed by module-level state and spies.
 * Every `createNavMock()` call returns the same underlying state and spy references.
 * Always call `mockNav.reset()` in `beforeEach` to isolate tests from each other.
 */

const mockNav = createNavMock()

describe('navMockModule', () => {
  beforeEach(() => {
    mockNav.reset()
  })

  it('exposes useSearchParams returning empty URLSearchParams by default', () => {
    expect(navMockModule.useSearchParams().toString()).toBe('')
  })

  it('exposes usePathname returning "/" by default', () => {
    expect(navMockModule.usePathname()).toBe('/')
  })

  it('exposes useParams returning {} by default', () => {
    expect(navMockModule.useParams()).toEqual({})
  })

  it('exposes useRouter with the push spy', () => {
    expect(navMockModule.useRouter().push).toBe(mockNav.push)
  })

  it('exposes the stable back-forward cache identifier required by Next', () => {
    expect(navMockModule.useRouter().bfcacheId).toBe('0')
  })
})

describe('createNavMock', () => {
  beforeEach(() => {
    mockNav.reset()
  })

  describe('setSearchParams', () => {
    it('sets params from a query string', () => {
      mockNav.setSearchParams('q=hello&sort=new')
      expect(navMockModule.useSearchParams().get('q')).toBe('hello')
      expect(navMockModule.useSearchParams().get('sort')).toBe('new')
    })

    it('sets params from an existing URLSearchParams instance', () => {
      mockNav.setSearchParams(new URLSearchParams('rss_item=item-3'))
      expect(navMockModule.useSearchParams().get('rss_item')).toBe('item-3')
    })

    it('resets to empty when called with no argument', () => {
      mockNav.setSearchParams('q=hello')
      mockNav.setSearchParams()
      expect(navMockModule.useSearchParams().toString()).toBe('')
    })

    it('returns a real URLSearchParams instance preserving method contract', () => {
      mockNav.setSearchParams('q=hello')
      const params = navMockModule.useSearchParams()
      expect(params).toBeInstanceOf(URLSearchParams)
      expect(params.has('q')).toBe(true)
      expect([...params.entries()]).toEqual([['q', 'hello']])
    })
  })

  describe('setPathname', () => {
    it('changes the value returned by usePathname', () => {
      mockNav.setPathname('/news')
      expect(navMockModule.usePathname()).toBe('/news')
    })
  })

  describe('setParams', () => {
    it('changes the value returned by useParams', () => {
      mockNav.setParams({ id: '123', slug: 'my-post' })
      expect(navMockModule.useParams()).toEqual({ id: '123', slug: 'my-post' })
    })
  })

  describe('reset', () => {
    it('clears searchParams back to empty', () => {
      mockNav.setSearchParams('q=hello')
      mockNav.reset()
      expect(navMockModule.useSearchParams().toString()).toBe('')
    })

    it('resets pathname to "/"', () => {
      mockNav.setPathname('/news')
      mockNav.reset()
      expect(navMockModule.usePathname()).toBe('/')
    })

    it('resets params to empty object', () => {
      mockNav.setParams({ id: '123' })
      mockNav.reset()
      expect(navMockModule.useParams()).toEqual({})
    })

    it('clears push spy call history', () => {
      mockNav.push('/somewhere')
      expect(mockNav.push).toHaveBeenCalledTimes(1)
      mockNav.reset()
      expect(mockNav.push).toHaveBeenCalledTimes(0)
    })

    it('resets all router spies', () => {
      mockNav.replace('/other')
      mockNav.refresh()
      mockNav.reset()
      expect(mockNav.replace).not.toHaveBeenCalled()
      expect(mockNav.refresh).not.toHaveBeenCalled()
    })
  })

  describe('singleton — module export matches createNavMock references', () => {
    it('mockNav.module is navMockModule', () => {
      expect(mockNav.module).toBe(navMockModule)
    })

    it('push spy is shared between mockNav and navMockModule.useRouter()', () => {
      expect(navMockModule.useRouter().push).toBe(mockNav.push)
    })
  })

  describe('beforeEach reset isolation', () => {
    it('first test: sets some state', () => {
      mockNav.setSearchParams('q=first')
      expect(navMockModule.useSearchParams().get('q')).toBe('first')
    })

    it('second test: starts fresh after reset', () => {
      expect(navMockModule.useSearchParams().toString()).toBe('')
    })
  })
})
