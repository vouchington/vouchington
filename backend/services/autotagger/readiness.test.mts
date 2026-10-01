import { listPendingClassifierRunRequests } from '@services/classifier-runs'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  embedAutotaggerPost,
  requestAutotaggerRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { setPostClassifierPostHashForTest } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { describe, expect, it } from 'vitest'
import { createAutotaggerRunAdapter } from './adapter.mts'

const adapter = createAutotaggerRunAdapter()

/** Every subject id with a request the sweep would dispatch now, drained across pages. */
async function sweepableSubjectIds(after: string | null = null): Promise<string[]> {
  const page = await listPendingClassifierRunRequests(adapter, after)
  const ids = page.items.map(item => item.postId ?? item.rssFeedItemId ?? '')
  return page.next ? [...ids, ...(await sweepableSubjectIds(page.next))] : ids
}

describe('C6 sweep eligibility (real PG)', () => {
  it('holds an approved post back until its embedding exists, without burning a sweep enqueue', async () => {
    const fixture = await createAutotaggerPostFixture({ embedded: false })
    await requestAutotaggerRun(fixture)
    expect(await sweepableSubjectIds()).not.toContain(fixture.post.id)

    await embedAutotaggerPost(fixture.post.id, fixture.embedding)

    expect(await sweepableSubjectIds()).toContain(fixture.post.id)
  })

  it('holds a feed item back until its embedding exists', async () => {
    const waiting = await createAutotaggerFeedItemFixture({ embedded: false })
    const ready = await createAutotaggerFeedItemFixture({ embedded: true })
    await Promise.all([requestAutotaggerRun(waiting), requestAutotaggerRun(ready)])

    const sweepable = await sweepableSubjectIds()

    expect(sweepable).toContain(ready.itemId)
    expect(sweepable).not.toContain(waiting.itemId)
  })

  it('skips a post that is no longer approved or whose content moved on', async () => {
    const unapproved = await createAutotaggerPostFixture()
    const edited = await createAutotaggerPostFixture()
    await Promise.all([requestAutotaggerRun(unapproved), requestAutotaggerRun(edited)])
    await setTestPostClearanceStatus(unapproved.post.id, 'pending')
    await setPostClassifierPostHashForTest(edited.post.id, Buffer.alloc(32, 7))

    const sweepable = await sweepableSubjectIds()

    expect(sweepable).not.toContain(unapproved.post.id)
    expect(sweepable).not.toContain(edited.post.id)
  })

  it('never discovers an approved post that no one requested', async () => {
    const fixture = await createAutotaggerPostFixture()

    expect(await sweepableSubjectIds()).not.toContain(fixture.post.id)
  })
})
