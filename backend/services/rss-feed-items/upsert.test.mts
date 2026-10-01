import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { readClassifierRunDispatcherJobsForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { createRssFeedItemEmbeddingContent } from './content.mts'
import { getRssFeedItemById } from './get.mts'
import { upsertRssFeedItems } from './upsert.mts'

const inputFor = (guid: string, title: string) => ({
  guid,
  link: `https://upsert-request-${guid}.example.com/article`,
  title,
})

const requestsOf = (rssFeedItemId: string) =>
  getSubjectClassifierRunRequestFacts({ postId: null, rssFeedItemId }, TAGGING_CLASSIFIER_SLUG)

describe('upsertRssFeedItems requests C6 for each item (real PG)', () => {
  it('writes one pending request at the item content digest, with no dispatcher queued', async () => {
    const feed = await insertTestRssFeedDirect({})
    const guid = randomUUID()

    const [item] = await upsertRssFeedItems(feed.id, [inputFor(guid, 'First title')])

    const stored = await getRssFeedItemById(item!.id)
    const requests = await requestsOf(item!.id)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ run_id: null, no_work_at: null, stale_at: null })
    expect(
      requests[0]!.input_sha256.equals(
        createRssFeedItemEmbeddingContent(stored!.data).content_sha256,
      ),
    ).toBe(true)
    expect(await readClassifierRunDispatcherJobsForTest(item!.id)).toEqual([])
  })

  it('keeps that one request when the same content is upserted again', async () => {
    const feed = await insertTestRssFeedDirect({})
    const guid = randomUUID()
    const [item] = await upsertRssFeedItems(feed.id, [inputFor(guid, 'Stable title')])

    await upsertRssFeedItems(feed.id, [inputFor(guid, 'Stable title')])

    expect(await requestsOf(item!.id)).toHaveLength(1)
  })

  it('stales the request for replaced content and requests the new content', async () => {
    const feed = await insertTestRssFeedDirect({})
    const guid = randomUUID()
    const [item] = await upsertRssFeedItems(feed.id, [inputFor(guid, 'Original title')])

    await upsertRssFeedItems(feed.id, [inputFor(guid, 'Revised title')])

    const requests = await requestsOf(item!.id)
    expect(requests).toHaveLength(2)
    expect(requests.filter(request => request.stale_at === null)).toHaveLength(1)
    expect(requests.filter(request => request.stale_at !== null)).toHaveLength(1)
  })
})
