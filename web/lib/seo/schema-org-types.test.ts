import { describe, it, expect } from 'vitest'
import { getSchemaOrgType } from './schema-org-types'

describe('getSchemaOrgType', () => {
  it('returns correct schema.org type for books category', () => {
    expect(getSchemaOrgType(['books'])).toBe('Book')
  })

  it('returns correct schema.org type for courses category', () => {
    expect(getSchemaOrgType(['courses'])).toBe('Course')
  })

  it('returns correct schema.org type for movies category', () => {
    expect(getSchemaOrgType(['movies'])).toBe('Movie')
  })

  it('returns correct schema.org type for events category', () => {
    expect(getSchemaOrgType(['events'])).toBe('Event')
  })

  it('returns correct schema.org type for local-businesses category', () => {
    expect(getSchemaOrgType(['local-businesses'])).toBe('LocalBusiness')
  })

  it('returns correct schema.org type for products category', () => {
    expect(getSchemaOrgType(['products'])).toBe('Product')
  })

  it('returns correct schema.org type for software-products category', () => {
    expect(getSchemaOrgType(['software-products'])).toBe('SoftwareApplication')
  })

  it('returns correct schema.org type for hardware-products category', () => {
    expect(getSchemaOrgType(['hardware-products'])).toBe('Product')
  })

  it('returns correct schema.org type for recipes category', () => {
    expect(getSchemaOrgType(['recipes'])).toBe('Recipe')
  })

  it('returns correct schema.org type for tv-shows category', () => {
    expect(getSchemaOrgType(['tv-shows'])).toBe('CreativeWorkSeries')
  })

  it('returns correct schema.org type for tv-show-episodes category', () => {
    expect(getSchemaOrgType(['tv-show-episodes'])).toBe('Episode')
  })

  it('returns correct schema.org type for tv-show-seasons category', () => {
    expect(getSchemaOrgType(['tv-show-seasons'])).toBe('CreativeWorkSeason')
  })

  it('returns correct schema.org type for songs category', () => {
    expect(getSchemaOrgType(['songs'])).toBe('MusicRecording')
  })

  it('returns correct schema.org type for playlists category', () => {
    expect(getSchemaOrgType(['playlists'])).toBe('MusicPlaylist')
  })

  it('returns correct schema.org type for games category', () => {
    expect(getSchemaOrgType(['games'])).toBe('Game')
  })

  it('returns correct schema.org type for organizations category', () => {
    expect(getSchemaOrgType(['organizations'])).toBe('Organization')
  })

  it('returns Thing as fallback for unknown category', () => {
    expect(getSchemaOrgType(['unknown-category'])).toBe('Thing')
  })

  it('returns Thing when categories array is empty', () => {
    expect(getSchemaOrgType([])).toBe('Thing')
  })

  it('returns first matching type from multiple categories', () => {
    expect(getSchemaOrgType(['unknown', 'books', 'movies'])).toBe('Book')
  })

  it('skips unknown categories and uses first known match', () => {
    expect(getSchemaOrgType(['invalid1', 'invalid2', 'movies'])).toBe('Movie')
  })
})
