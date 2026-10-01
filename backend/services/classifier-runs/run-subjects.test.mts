import { describe, expect, it } from 'vitest'
import {
  createAutotaggerPostFixture,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { requestApprovedPostClassifierRuns } from './run-subjects.mts'

const requestsOf = (fixture: { subject: { postId: string; rssFeedItemId: null } }) =>
  getSubjectClassifierRunRequestFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG)

describe('requestApprovedPostClassifierRuns (real PG)', () => {
  it('requests each classifier at the approved post content, once however it repeats', async () => {
    const fixture = await createAutotaggerPostFixture()

    await requestApprovedPostClassifierRuns(fixture.post.id, [TAGGING_CLASSIFIER_SLUG])
    await requestApprovedPostClassifierRuns(fixture.post.id, [TAGGING_CLASSIFIER_SLUG])

    const requests = await requestsOf(fixture)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.input_sha256.equals(fixture.inputSha256)).toBe(true)
    expect(requests[0]).toMatchObject({ run_id: null, no_work_at: null, stale_at: null })
  })

  it('requests nothing for a post that is not approved', async () => {
    const fixture = await createAutotaggerPostFixture()
    await setTestPostClearanceStatus(fixture.post.id, 'pending')

    await requestApprovedPostClassifierRuns(fixture.post.id, [TAGGING_CLASSIFIER_SLUG])

    expect(await requestsOf(fixture)).toEqual([])
  })

  it('requests nothing when no classifier is asked for', async () => {
    const fixture = await createAutotaggerPostFixture()

    await requestApprovedPostClassifierRuns(fixture.post.id, [])

    expect(await requestsOf(fixture)).toEqual([])
  })
})
