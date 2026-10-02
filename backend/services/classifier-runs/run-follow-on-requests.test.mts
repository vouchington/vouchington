import {
  AUTOTAGGER_AGENT_SLUG,
  completeTaggingRunForTest,
  supersedeClassifierRunForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import {
  hasCompletedClassifierRunForTest,
  requestFollowOnForTest,
  settleAutotaggerAgentRequestForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-service-calls'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { describe, expect, it } from 'vitest'
import type { ClassifierRunSubject } from './types.mts'

/** What the follow-on helpers read from a post or feed item fixture. */
type Fixture = { subject: ClassifierRunSubject; inputSha256: Buffer }

const requestsOf = (fixture: Fixture) =>
  getSubjectClassifierRunRequestFacts(fixture.subject, AUTOTAGGER_AGENT_SLUG)

describe('requestFollowOnClassifierRun (real PG)', () => {
  it('writes one pending request at the content, however often it is asked', async () => {
    const fixture = await createAutotaggerPostFixture()

    await requestFollowOnForTest(fixture)
    await requestFollowOnForTest(fixture)

    const requests = await requestsOf(fixture)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.input_sha256.equals(fixture.inputSha256)).toBe(true)
    expect(requests[0]).toMatchObject({ run_id: null, no_work_at: null, stale_at: null })
  })

  it('writes the same request for a feed item', async () => {
    const fixture = await createAutotaggerFeedItemFixture()

    await requestFollowOnForTest(fixture)

    expect(await requestsOf(fixture)).toHaveLength(1)
  })

  it('never re-arms a request that already settled with no work', async () => {
    const fixture = await createAutotaggerPostFixture()
    await requestFollowOnForTest(fixture)
    await settleAutotaggerAgentRequestForTest(fixture, {
      kind: 'no-work',
      inputSha256: fixture.inputSha256,
    })
    const settled = await requestsOf(fixture)

    await requestFollowOnForTest(fixture)

    expect(await requestsOf(fixture)).toEqual(settled)
  })

  it('revives a request the sweep retired as stale, once the subject is back at that content', async () => {
    const fixture = await createAutotaggerPostFixture()
    await requestFollowOnForTest(fixture)
    await settleAutotaggerAgentRequestForTest(fixture, {
      kind: 'stale',
      inputSha256: fixture.inputSha256,
    })

    await requestFollowOnForTest(fixture)

    expect(await requestsOf(fixture)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: null },
    ])
  })

  it('writes nothing for a classifier slug that is not seeded', async () => {
    const fixture = await createAutotaggerPostFixture()

    await requestFollowOnForTest(fixture, 'not-a-seeded-classifier')

    expect(await getSubjectClassifierRunRequestFacts(fixture.subject)).toEqual([])
  })
})

describe('hasCompletedClassifierRun (real PG)', () => {
  const input = (fixture: Fixture, inputSha256 = fixture.inputSha256) => ({
    subject: fixture.subject,
    inputSha256,
    classifierSlug: TAGGING_CLASSIFIER_SLUG,
  })

  it.each([
    ['a post', createAutotaggerPostFixture],
    ['a feed item', createAutotaggerFeedItemFixture],
  ] as const)(
    'is true for %s only once a current run completed at exactly that content',
    async (_name, create) => {
      const fixture = await create()
      expect(await hasCompletedClassifierRunForTest(input(fixture))).toBe(false)

      const { lease } = await completeTaggingRunForTest(fixture)

      expect(await hasCompletedClassifierRunForTest(input(fixture))).toBe(true)
      expect(await hasCompletedClassifierRunForTest(input(fixture, Buffer.alloc(32, 9)))).toBe(
        false,
      )
      expect(
        await hasCompletedClassifierRunForTest({
          ...input(fixture),
          classifierSlug: AUTOTAGGER_AGENT_SLUG,
        }),
      ).toBe(false)

      await supersedeClassifierRunForTest(lease.runId)

      expect(await hasCompletedClassifierRunForTest(input(fixture))).toBe(false)
    },
  )
})
