import createHttpError from 'http-errors'
import { describe, expect, it } from 'vitest'
import { findPageOrNull, INVALID_CURSOR_RESULT } from './paged-search.mts'

const refuse = (error: Error) => async (): Promise<never> => {
  throw error
}

describe('findPageOrNull', () => {
  it('returns the page the lookup found', async () => {
    await expect(findPageOrNull('cursor', async () => ({ results: [] }))).resolves.toEqual({
      results: [],
    })
    await expect(findPageOrNull(undefined, async () => ({ results: [] }))).resolves.toEqual({
      results: [],
    })
  })

  it('turns a 400 into null when the call passed a cursor', async () => {
    await expect(findPageOrNull('cursor', refuse(createHttpError(400, 'bad')))).resolves.toBeNull()
  })

  it('lets a 400 propagate when no cursor was passed', async () => {
    const error = createHttpError(400, 'similar_rss_feed_item_id must be a valid UUID')

    await expect(findPageOrNull(undefined, refuse(error))).rejects.toBe(error)
  })

  it('turns an empty cursor into null without running the lookup', async () => {
    let lookups = 0
    const find = async () => {
      lookups += 1
      return { results: [] }
    }

    await expect(findPageOrNull('', find)).resolves.toBeNull()
    expect(lookups).toBe(0)
  })

  it('lets other statuses and non-HTTP errors propagate even with a cursor', async () => {
    const server = createHttpError(500, 'relevance_tier missing from query result')
    const plain = new Error('connection lost')

    await expect(findPageOrNull('cursor', refuse(server))).rejects.toBe(server)
    await expect(findPageOrNull('cursor', refuse(plain))).rejects.toBe(plain)
  })
})

describe('INVALID_CURSOR_RESULT', () => {
  it('is the failure result the search tools return', () => {
    expect(INVALID_CURSOR_RESULT).toEqual({ success: false, error: 'Invalid cursor' })
  })
})
