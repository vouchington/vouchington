import { describe, it, expect } from 'vitest'

import { createGetSearchParameters } from '../search.mts'

const validUUID = '123e4567-e89b-12d3-a456-426614174000'

const validUUID2 = '987fcdeb-51a2-43d1-b789-0123456789ab'

describe('createGetSearchParameters', () => {
  const now = Date.now()
  const pastDate = new Date(now - 3600000)

  it('should apply default limit', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 0,
      offset: 0,
      before_at: null,
      after_at: null,
      before_id: null,
      after_id: null,
      not_ids: [],
    })
    expect(result.limit).toBe(25)
  })

  it('should enforce max limit', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 200,
      offset: 0,
      before_at: null,
      after_at: null,
      before_id: null,
      after_id: null,
      not_ids: [],
    })
    expect(result.limit).toBe(100)
  })

  it('should use provided limit within bounds', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 50,
      offset: 0,
      before_at: null,
      after_at: null,
      before_id: null,
      after_id: null,
      not_ids: [],
    })
    expect(result.limit).toBe(50)
  })

  it('should truncate limit to integer', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 50.7,
      offset: 0,
      before_at: null,
      after_at: null,
      before_id: null,
      after_id: null,
      not_ids: [],
    })
    expect(result.limit).toBe(50)
  })

  it('should set offset to 0 for negative values', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 25,
      offset: -10,
      before_at: null,
      after_at: null,
      before_id: null,
      after_id: null,
      not_ids: [],
    })
    expect(result.offset).toBe(0)
  })

  it('should parse date from seconds', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 25,
      offset: 0,
      before_at: pastDate,
      after_at: pastDate,
      before_id: null,
      after_id: null,
      not_ids: [],
    })
    expect(result.before_at).toBe(pastDate)
    expect(result.after_at).toBe(pastDate)
  })

  it('should validate UUIDs in before_id and after_id', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 25,
      offset: 0,
      before_at: null,
      after_at: null,
      before_id: validUUID,
      after_id: validUUID2,
      not_ids: [],
    })
    expect(result.before_id).toBe(validUUID)
    expect(result.after_id).toBe(validUUID2)
  })

  it('should parse not_ids array', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 25,
      offset: 0,
      before_at: null,
      after_at: null,
      before_id: null,
      after_id: null,
      not_ids: [validUUID, validUUID2],
    })
    expect(result.not_ids).toEqual([validUUID, validUUID2])
  })

  it('should handle null values', () => {
    const getSearchParams = createGetSearchParameters({ maxLimit: 100, defaultLimit: 25 })
    const result = getSearchParams({
      limit: 25,
      offset: 0,
      before_at: null,
      after_at: null,
      before_id: null,
      after_id: null,
      not_ids: [],
    })
    expect(result.before_at).toBe(null)
    expect(result.after_at).toBe(null)
    expect(result.before_id).toBe(null)
    expect(result.after_id).toBe(null)
    expect(result.not_ids).toEqual([])
  })
})
