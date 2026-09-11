import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processRssFeedRow } from './process-rss-feed-row.mts'
import type { PrivateUser } from '@services/users/types'
import type { ImportRow } from './types.mts'

const importSingleRssFeed = vi.fn<VitestLooseMock>()

function makeUser(overrides?: Partial<PrivateUser>): PrivateUser {
  return {
    id: '01900000-0000-7000-0000-000000000001',
    email: 'tests+rss-feed-row-mock@voucha.ai',
    username: 'testuser',
    roles: [],
    administrator: false,
    suspended_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as PrivateUser
}

function makeRow(inputData: Record<string, unknown>): ImportRow {
  return {
    id: '01900000-0000-7000-0000-000000000002',
    batch_id: '01900000-0000-7000-0000-000000000003',
    row_index: 0,
    input_data: inputData,
    created_entity_id: null,
    completed_at: null,
    failed_at: null,
    error_message: null,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function processRow(user: PrivateUser, row: ImportRow) {
  return processRssFeedRow(user, row, { importSingleRssFeed })
}

describe('processRssFeedRow', () => {
  const user = makeUser()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns entity_id on source_created status', async () => {
    const row = makeRow({ url: 'https://example.com/feed.xml', follow: false })
    importSingleRssFeed.mockResolvedValue({
      input: 'https://example.com/feed.xml',
      status: 'source_created',
      entity_id: 'entity-abc-123',
    })

    const result = await processRow(user, row)

    expect(result).toBe('entity-abc-123')
    expect(importSingleRssFeed).toHaveBeenCalledWith(user, 'https://example.com/feed.xml', {
      follow: false,
    })
  })

  it('returns entity_id on followed status', async () => {
    const row = makeRow({ url: 'https://example.com/feed.xml', follow: true })
    importSingleRssFeed.mockResolvedValue({
      input: 'https://example.com/feed.xml',
      status: 'followed',
      entity_id: 'entity-followed-123',
    })

    const result = await processRow(user, row)

    expect(result).toBe('entity-followed-123')
  })

  it('returns entity_id on already_following status', async () => {
    const row = makeRow({ url: 'https://example.com/feed.xml', follow: true })
    importSingleRssFeed.mockResolvedValue({
      input: 'https://example.com/feed.xml',
      status: 'already_following',
      entity_id: 'entity-existing-456',
    })

    const result = await processRow(user, row)

    expect(result).toBe('entity-existing-456')
  })

  it('throws when status is error', async () => {
    const row = makeRow({ url: 'https://bad-url.example.com/rss' })
    importSingleRssFeed.mockResolvedValue({
      input: 'https://bad-url.example.com/rss',
      status: 'error',
      error: 'URL has query parameters',
    })

    await expect(processRow(user, row)).rejects.toThrow('URL has query parameters')
  })

  it('throws with fallback message when error has no message', async () => {
    const row = makeRow({ url: 'https://bad-url.example.com/rss' })
    importSingleRssFeed.mockResolvedValue({
      input: 'https://bad-url.example.com/rss',
      status: 'error',
    })

    await expect(processRow(user, row)).rejects.toThrow(
      'Failed to import RSS feed: https://bad-url.example.com/rss',
    )
  })

  it('defaults follow to false when not specified', async () => {
    const row = makeRow({ url: 'https://example.com/feed.xml' })
    importSingleRssFeed.mockResolvedValue({
      input: 'https://example.com/feed.xml',
      status: 'source_created',
      entity_id: 'entity-no-follow',
    })

    await processRow(user, row)

    expect(importSingleRssFeed).toHaveBeenCalledWith(user, 'https://example.com/feed.xml', {
      follow: false,
    })
  })
})
