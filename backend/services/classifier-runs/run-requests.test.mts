import { describe, expect, it } from 'vitest'
import {
  createAutotaggerFeedItemFixture,
  requestAutotaggerFeedItems,
  reserveAutotaggerRun,
  reviseAutotaggerFeedItem,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'

const requestsOf = (fixture: { subject: { postId: null; rssFeedItemId: string } }) =>
  getSubjectClassifierRunRequestFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG)

describe('feed item classifier run requests (real PG)', () => {
  it('writes one pending request at the item content, however often the upsert repeats it', async () => {
    const fixture = await createAutotaggerFeedItemFixture()

    await requestAutotaggerFeedItems([fixture.itemId])
    await requestAutotaggerFeedItems([fixture.itemId, fixture.itemId])

    const requests = await requestsOf(fixture)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.input_sha256.equals(fixture.inputSha256)).toBe(true)
    expect(requests[0]).toMatchObject({ run_id: null, no_work_at: null, stale_at: null })
  })

  it('writes nothing for an empty batch', async () => {
    const fixture = await createAutotaggerFeedItemFixture()

    await requestAutotaggerFeedItems([])

    expect(await requestsOf(fixture)).toEqual([])
  })

  it('never re-arms a request that already settled when unchanged content is upserted again', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    const run = await reserveAutotaggerRun(fixture)

    await requestAutotaggerFeedItems([fixture.itemId])

    expect(await requestsOf(fixture)).toMatchObject([{ run_id: run.runId }])
  })

  it('marks an unsettled request for older content stale and requests the new content', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    await requestAutotaggerFeedItems([fixture.itemId])
    const revised = await reviseAutotaggerFeedItem(fixture.itemId)

    await requestAutotaggerFeedItems([fixture.itemId])

    const requests = await requestsOf(fixture)
    const older = requests.find(request => request.input_sha256.equals(fixture.inputSha256))
    const newer = requests.find(request => request.input_sha256.equals(revised))
    expect(requests).toHaveLength(2)
    expect(older!.stale_at).not.toBeNull()
    expect(newer).toMatchObject({ run_id: null, no_work_at: null, stale_at: null })
  })
})
