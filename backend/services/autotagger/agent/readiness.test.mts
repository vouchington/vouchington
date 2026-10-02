import { listPendingClassifierRunRequests } from '@services/classifier-runs'
import {
  AUTOTAGGER_AGENT_SLUG,
  completeTaggingRunForTest,
  supersedeClassifierRunForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { requestAutotaggerAgentRun } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-service-calls'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  reviseAutotaggerFeedItem,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { describe, expect, it } from 'vitest'
import { createAutotaggerAgentRunAdapter } from './adapter.mts'

const adapter = createAutotaggerAgentRunAdapter()

/** Every subject id with a request the sweep would dispatch now, drained across pages. */
async function sweepableSubjectIds(after: string | null = null): Promise<string[]> {
  const page = await listPendingClassifierRunRequests(adapter, after)
  const ids = page.items.map(item => item.postId ?? item.rssFeedItemId ?? '')
  return page.next ? [...ids, ...(await sweepableSubjectIds(page.next))] : ids
}

describe('C7 sweep eligibility (real PG)', () => {
  it('holds a request back until the first stage completed, without retiring it', async () => {
    const fixture = await createAutotaggerPostFixture()
    await requestAutotaggerAgentRun(fixture)

    expect(await sweepableSubjectIds()).not.toContain(fixture.post.id)
    expect(
      await getSubjectClassifierRunRequestFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG),
    ).toMatchObject([{ stale_at: null, no_work_at: null, run_id: null }])

    await completeTaggingRunForTest(fixture)

    expect(await sweepableSubjectIds()).toContain(fixture.post.id)
  })

  it('dispatches the request the first stage’s completion wrote, for a post and a feed item', async () => {
    const post = await createAutotaggerPostFixture()
    const item = await createAutotaggerFeedItemFixture()
    await Promise.all([completeTaggingRunForTest(post), completeTaggingRunForTest(item)])

    const sweepable = await sweepableSubjectIds()

    expect(sweepable).toContain(post.post.id)
    expect(sweepable).toContain(item.itemId)
  })

  it('skips a request whose first-stage result was superseded', async () => {
    const fixture = await createAutotaggerPostFixture()
    const { lease } = await completeTaggingRunForTest(fixture)
    await supersedeClassifierRunForTest(lease.runId)

    expect(await sweepableSubjectIds()).not.toContain(fixture.post.id)
  })

  it('retires a request once the subject moved on to other content', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    await completeTaggingRunForTest(fixture)
    await reviseAutotaggerFeedItem(fixture.itemId)

    expect(await sweepableSubjectIds()).not.toContain(fixture.itemId)
    expect(
      await getSubjectClassifierRunRequestFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG),
    ).toMatchObject([{ stale_at: expect.any(Date) }])
  })

  it('skips a post that is no longer approved', async () => {
    const fixture = await createAutotaggerPostFixture()
    await completeTaggingRunForTest(fixture)
    await setTestPostClearanceStatus(fixture.post.id, 'pending')

    expect(await sweepableSubjectIds()).not.toContain(fixture.post.id)
  })

  it('never discovers a subject the first stage never completed', async () => {
    const fixture = await createAutotaggerPostFixture()

    expect(await sweepableSubjectIds()).not.toContain(fixture.post.id)
  })
})
