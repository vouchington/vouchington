import { describe, expect, it } from 'vitest'
import { cloneCatalog, mergeCatalogInPlace } from '../merge-catalog'

describe('mergeCatalogInPlace', () => {
  it('adds new namespaces without replacing existing leaves', () => {
    const target = { nav: { home: 'Home' }, extracted: { feed: { title: 'Feed' } } }
    mergeCatalogInPlace(target, {
      nav: { search: 'Search' },
      extracted: { admin: { title: 'Admin' } },
    })
    expect(target).toEqual({
      nav: { home: 'Home', search: 'Search' },
      extracted: { feed: { title: 'Feed' }, admin: { title: 'Admin' } },
    })
  })
})

describe('cloneCatalog', () => {
  it('returns a deep copy', () => {
    const original = { nav: { home: 'Home' } }
    const cloned = cloneCatalog(original)
    mergeCatalogInPlace(cloned as Record<string, unknown>, { nav: { home: 'Inicio' } })
    expect(original.nav.home).toBe('Home')
    expect(cloned).toEqual({ nav: { home: 'Inicio' } })
  })
})
