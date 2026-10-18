import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  getFirstRssFeedImportRowId,
  getRssFeedImportRowIds,
} from '@voucha/test-helpers/rss-feed-import-rows'
import { createTestUser, insertTestRssFeedDirect, WEB_PROVENANCE } from '@voucha/test-helpers'
import { softDeleteUser } from '@voucha/test-helpers/entities/users-lifecycle'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'
import type { PrivateUser } from '@services/users/types'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'
import {
  updateRssFeedImportRowCompleted,
  updateRssFeedImportRowFailed,
} from './rss-feed-import-row-updates.mts'

const validFeedResponse = () => ({
  response: new Response(
    '<rss version="2.0"><channel><title>Imported feed</title></channel></rss>',
    { headers: { 'content-type': 'application/rss+xml' } },
  ),
  responseSignal: new AbortController().signal,
})

const invalidFeedResponse = () => ({
  response: new Response('not an RSS document', {
    headers: { 'content-type': 'application/rss+xml' },
  }),
  responseSignal: new AbortController().signal,
})

describe('RSS feed import batches', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('creates a pending import batch with one row per URL', async () => {
    const urls = [
      `https://batch-import-a-${Date.now()}.example.com/rss`,
      `https://batch-import-b-${Date.now()}.example.com/rss`,
    ]

    const creation = await withCapturedTestQueries(() =>
      submitRssFeedImport(user, WEB_PROVENANCE, urls, {
        should_follow_imported_feeds: false,
      }),
    )
    const created = creation.result
    const lookup = await withCapturedTestQueries(() => getRssFeedImport(user.id, created.import.id))
    const status = lookup.result

    expect(countCapturedQueriesByAnnotation(creation.queries, 'createRssFeedImport')).toBe(1)
    expect(countCapturedQueriesByAnnotation(lookup.queries, 'getRssFeedImport')).toBe(1)
    await expect(getRssFeedImportRowIds(created.import.id)).resolves.toHaveLength(2)
    expect(status?.import).toMatchObject({
      id: created.import.id,
      total_rows: 2,
      completed_rows: 0,
      failed_rows: 0,
      pending_rows: 2,
    })
    expect(status?.rows.map(row => row.status)).toEqual(['pending', 'pending'])
  })

  it('rejects rows that do not belong to the requested import', async () => {
    const first = await submitRssFeedImport(user, WEB_PROVENANCE, [
      `https://wrong-import-a-${Date.now()}.example.com/rss`,
    ])
    const second = await submitRssFeedImport(user, WEB_PROVENANCE, [
      `https://wrong-import-b-${Date.now()}.example.com/rss`,
    ])

    await expect(
      processRssFeedImportRow(first.import.id, await getFirstRssFeedImportRowId(second.import.id)),
    ).rejects.toThrow(`belongs to import ${second.import.id}`)
  })

  it('marks rows failed when the import user is no longer available', async () => {
    const transientUser = await createTestUser()
    const created = await submitRssFeedImport(transientUser, WEB_PROVENANCE, [
      `https://missing-user-import-${Date.now()}.example.com/rss`,
    ])
    await softDeleteUser(transientUser.id)

    await processRssFeedImportRow(
      created.import.id,
      await getFirstRssFeedImportRowId(created.import.id),
    )

    const status = await getRssFeedImport(transientUser.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      status: 'error',
      error_code: 'IMPORT_FAILED',
    })
  })

  it('records a successful existing-feed row', async () => {
    const rssFeedUrl = `https://existing-import-${Date.now()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl })
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, [rssFeedUrl])

    await processRssFeedImportRow(
      created.import.id,
      await getFirstRssFeedImportRowId(created.import.id),
    )

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 1,
      failed_rows: 0,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      input: rssFeedUrl,
      status: 'followed',
      entity_id: rssFeed.id,
    })
  })

  it('records a source_created row for a newly created feed', async () => {
    const rssFeedUrl = `https://new-import-${Date.now()}.example.com/feed.xml`
    const fetchUrl = vi.fn<() => Promise<ReturnType<typeof validFeedResponse>>>(async () =>
      validFeedResponse(),
    )
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, [rssFeedUrl])

    await processRssFeedImportRow(
      created.import.id,
      await getFirstRssFeedImportRowId(created.import.id),
      { crawlerRssOptions: { dependencies: { fetchUrl } } },
    )

    expect(fetchUrl).toHaveBeenCalledWith(expect.objectContaining({ url: rssFeedUrl }))
    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.rows[0]).toMatchObject({
      input: rssFeedUrl,
      status: 'source_created',
      entity_id: expect.any(String),
    })
  })

  it('records invalid URL rows as errors without calling source creation', async () => {
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, ['not-a-url'])

    await processRssFeedImportRow(
      created.import.id,
      await getFirstRssFeedImportRowId(created.import.id),
    )

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      input: 'not-a-url',
      status: 'error',
      error_code: 'INVALID_URL',
    })
  })

  it('keeps invalid feed content pending before the final attempt', async () => {
    const rssFeedUrl = `https://retry-import-${Date.now()}.example.com/feed.xml`
    const fetchUrl = vi.fn<() => Promise<ReturnType<typeof validFeedResponse>>>(async () =>
      invalidFeedResponse(),
    )
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, [rssFeedUrl])

    await expect(
      processRssFeedImportRow(
        created.import.id,
        await getFirstRssFeedImportRowId(created.import.id),
        {
          isFinalAttempt: false,
          crawlerRssOptions: { dependencies: { fetchUrl } },
        },
      ),
    ).rejects.toMatchObject({ status: 422 })

    expect(fetchUrl).toHaveBeenCalledOnce()
    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import.pending_rows).toBe(1)
    expect(status?.rows[0]).toMatchObject({
      status: 'pending',
      error_code: 'INVALID_FEED_CONTENT',
    })
  })

  it('does not reprocess terminal invalid-feed rows', async () => {
    const rssFeedUrl = `https://terminal-failure-import-${Date.now()}.example.com/feed.xml`
    let serveValidFeed = false
    const fetchUrl = vi.fn<() => Promise<ReturnType<typeof validFeedResponse>>>(async () =>
      serveValidFeed ? validFeedResponse() : invalidFeedResponse(),
    )
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, [rssFeedUrl])

    await expect(
      processRssFeedImportRow(
        created.import.id,
        await getFirstRssFeedImportRowId(created.import.id),
        { crawlerRssOptions: { dependencies: { fetchUrl } } },
      ),
    ).rejects.toMatchObject({ status: 422 })

    serveValidFeed = true

    await processRssFeedImportRow(
      created.import.id,
      await getFirstRssFeedImportRowId(created.import.id),
      { crawlerRssOptions: { dependencies: { fetchUrl } } },
    )

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(fetchUrl).toHaveBeenCalledOnce()
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      status: 'error',
      error_code: 'INVALID_FEED_CONTENT',
    })
  })

  it('does not count duplicate terminal failures twice', async () => {
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, [
      `https://duplicate-failure-import-${Date.now()}.example.com/feed.xml`,
    ])
    const rowId = await getFirstRssFeedImportRowId(created.import.id)

    await updateRssFeedImportRowFailed(rowId, 'terminal failure', { isFinalAttempt: true })
    await updateRssFeedImportRowFailed(rowId, 'duplicate failure', { isFinalAttempt: true })

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      status: 'error',
      error_code: 'IMPORT_FAILED',
    })
  })

  it('does not let stale successes overwrite terminal failures', async () => {
    const rssFeed = await insertTestRssFeedDirect({})
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, [
      `https://stale-success-import-${Date.now()}.example.com/feed.xml`,
    ])
    const rowId = await getFirstRssFeedImportRowId(created.import.id)

    await updateRssFeedImportRowFailed(rowId, 'terminal failure', { isFinalAttempt: true })
    await updateRssFeedImportRowCompleted(rowId, 'source_created', rssFeed.id)

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.import).toMatchObject({
      completed_rows: 0,
      failed_rows: 1,
      pending_rows: 0,
    })
    expect(status?.rows[0]).toMatchObject({
      status: 'error',
      error_code: 'IMPORT_FAILED',
    })
  })
})
