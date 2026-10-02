import { listPendingClassifierRunRequests } from '@services/classifier-runs'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  embedAutotaggerPost,
  requestAutotaggerFeedItems,
  requestAutotaggerRun,
  reserveAutotaggerRun,
  reviseAutotaggerFeedItem,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  setFeedItemContentHashForTest,
  setFeedItemDeletedForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/request-retirement'
import {
  getSubjectClassifierRunRequestFacts,
  type ClassifierRunFactsSubject,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { describe, expect, it } from 'vitest'
import { createAutotaggerRunAdapter } from './adapter.mts'

const adapter = createAutotaggerRunAdapter()

/** Every subject id the sweep dispatches now, drained across pages. */
async function sweepableSubjectIds(after: string | null = null): Promise<string[]> {
  const page = await listPendingClassifierRunRequests(adapter, after)
  const ids = page.items.map(item => item.postId ?? item.rssFeedItemId ?? '')
  return page.next ? [...ids, ...(await sweepableSubjectIds(page.next))] : ids
}

async function requestIsRetired(subject: ClassifierRunFactsSubject): Promise<boolean[]> {
  const requests = await getSubjectClassifierRunRequestFacts(subject, TAGGING_CLASSIFIER_SLUG)
  return requests.map(request => request.stale_at !== null)
}

describe('C6 request retirement (real PG)', () => {
  it('retires the request of a post that is no longer approved', async () => {
    const fixture = await createAutotaggerPostFixture()
    await requestAutotaggerRun(fixture)
    await setTestPostClearanceStatus(fixture.post.id, 'pending')

    expect(await sweepableSubjectIds()).not.toContain(fixture.post.id)

    expect(await requestIsRetired(fixture.subject)).toEqual([true])
  })

  it('keeps the request of an approved post while its embedding is still being built', async () => {
    const fixture = await createAutotaggerPostFixture({ embedded: false })
    await requestAutotaggerRun(fixture)

    expect(await sweepableSubjectIds()).not.toContain(fixture.post.id)
    expect(await requestIsRetired(fixture.subject)).toEqual([false])

    await embedAutotaggerPost(fixture.post.id, fixture.embedding)
    expect(await sweepableSubjectIds()).toContain(fixture.post.id)
  })

  it('keeps the request of a feed item while its embedding is still being built', async () => {
    const fixture = await createAutotaggerFeedItemFixture({ embedded: false })
    await requestAutotaggerRun(fixture)

    expect(await sweepableSubjectIds()).not.toContain(fixture.itemId)

    expect(await requestIsRetired(fixture.subject)).toEqual([false])
  })

  it('retires the request of a deleted feed item and re-arms it when the upsert revives the item', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    await requestAutotaggerRun(fixture)
    await setFeedItemDeletedForTest(fixture.itemId, true)

    expect(await sweepableSubjectIds()).not.toContain(fixture.itemId)
    expect(await requestIsRetired(fixture.subject)).toEqual([true])

    await setFeedItemDeletedForTest(fixture.itemId, false)
    await requestAutotaggerFeedItems([fixture.itemId])

    expect(await requestIsRetired(fixture.subject)).toEqual([false])
    expect(await sweepableSubjectIds()).toContain(fixture.itemId)
  })

  it('retires the request for content a feed item moved away from and re-arms it when it returns', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    await requestAutotaggerRun(fixture)
    await reviseAutotaggerFeedItem(fixture.itemId)

    expect(await sweepableSubjectIds()).not.toContain(fixture.itemId)
    expect(await requestIsRetired(fixture.subject)).toEqual([true])

    await setFeedItemContentHashForTest(fixture.itemId, fixture.inputSha256)
    await requestAutotaggerFeedItems([fixture.itemId])

    expect(await requestIsRetired(fixture.subject)).toEqual([false])
    expect(await sweepableSubjectIds()).toContain(fixture.itemId)
  })

  it('does not re-arm a feed item request that settled with a run when the item is re-upserted', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    const run = await reserveAutotaggerRun(fixture)

    await requestAutotaggerFeedItems([fixture.itemId])

    const requests = await getSubjectClassifierRunRequestFacts(
      fixture.subject,
      TAGGING_CLASSIFIER_SLUG,
    )
    expect(requests.map(request => request.run_id)).toEqual([run.runId])
    expect(await sweepableSubjectIds()).not.toContain(fixture.itemId)
  })
})
