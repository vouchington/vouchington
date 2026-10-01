import { reserveClassifierRun, supersedeStaleClassifierRun } from '@services/classifier-runs'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  embedAutotaggerFeedItem,
  requestAutotaggerRun,
  reserveAutotaggerRun,
  reviseAutotaggerFeedItem,
  type AutotaggerFeedItemFixture,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { changeConfigurationAfterFirstResolve } from '@voucha/test-helpers/data-stores/psql/classifier-runs/altered-configuration'
import {
  observeCandidateCaptureLock,
  probeClassifierSubjectLockWhileHeld,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/lock-probe'
import {
  getClassifierRunCandidateTopicIdsForTest,
  getSubjectClassifierRunFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { describe, expect, it } from 'vitest'
import { createAutotaggerRunAdapter } from './adapter.mts'

const adapter = createAutotaggerRunAdapter()

/** Moves the feed item to new content with a current embedding, as a re-upsert and embed would. */
function reviseWithEmbedding(fixture: AutotaggerFeedItemFixture) {
  return async () => {
    await reviseAutotaggerFeedItem(fixture.itemId)
    await embedAutotaggerFeedItem(fixture.itemId, fixture.embedding)
  }
}

describe('C6 reservation lock scope (real PG)', () => {
  it('detects a held subject lock, so a free reading means something', async () => {
    const post = await createAutotaggerPostFixture()
    const item = await createAutotaggerFeedItemFixture()

    expect(await probeClassifierSubjectLockWhileHeld(adapter, post.subject)).toBe('held')
    expect(await probeClassifierSubjectLockWhileHeld(adapter, item.subject)).toBe('held')
  })

  it('searches a post’s candidates with no lock held, then reserves them', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
    await requestAutotaggerRun(fixture)
    const observed: Array<'free' | 'held'> = []

    const result = await reserveClassifierRun(
      observeCandidateCaptureLock(adapter, observed),
      fixture.subject,
    )

    expect(observed).toEqual(['free'])
    if (result.kind !== 'reserved') throw new Error(`Expected a reservation, got ${result.kind}`)
    expect(new Set(await getClassifierRunCandidateTopicIdsForTest(result.run.runId))).toEqual(
      new Set(fixture.topics.map(topic => topic.id)),
    )
  })

  it('searches a feed item’s candidates with no lock held, then reserves them', async () => {
    const fixture = await createAutotaggerFeedItemFixture({ topicCount: 2 })
    await requestAutotaggerRun(fixture)
    const observed: Array<'free' | 'held'> = []

    const result = await reserveClassifierRun(
      observeCandidateCaptureLock(adapter, observed),
      fixture.subject,
    )

    expect(observed).toEqual(['free'])
    expect(result.kind).toBe('reserved')
  })

  it('searches again against the new content when the subject changes during the search', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    await requestAutotaggerRun(fixture)
    const observed: Array<'free' | 'held'> = []
    let revised = false
    const revise = reviseWithEmbedding(fixture)

    const result = await reserveClassifierRun(
      observeCandidateCaptureLock(adapter, observed, async () => {
        if (revised) return
        revised = true
        await revise()
      }),
      fixture.subject,
    )

    expect(observed).toEqual(['free', 'free'])
    if (result.kind !== 'reserved') throw new Error(`Expected a reservation, got ${result.kind}`)
    expect(result.run.inputSha256.equals(fixture.inputSha256)).toBe(false)
    const runs = await getSubjectClassifierRunFacts(fixture.subject)
    expect(runs.map(run => run.id)).toEqual([result.run.runId])
  })

  it('searches again against the new configuration when it changes during the search', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    await requestAutotaggerRun(fixture)
    const observed: Array<'free' | 'held'> = []

    const result = await reserveClassifierRun(
      observeCandidateCaptureLock(changeConfigurationAfterFirstResolve(adapter), observed),
      fixture.subject,
    )

    expect(observed).toEqual(['free', 'free'])
    expect(result.kind).toBe('reserved')
    const runs = await getSubjectClassifierRunFacts(fixture.subject)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.id).toBe(result.kind === 'reserved' ? result.run.runId : null)
  })

  it('stops preparing after a bounded number of attempts and reserves nothing', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    await requestAutotaggerRun(fixture)
    const observed: Array<'free' | 'held'> = []

    const result = await reserveClassifierRun(
      observeCandidateCaptureLock(adapter, observed, reviseWithEmbedding(fixture)),
      fixture.subject,
    )

    expect(result).toEqual({ kind: 'not-ready' })
    expect(observed.length).toBeGreaterThan(1)
    expect(await getSubjectClassifierRunFacts(fixture.subject)).toEqual([])
  })

  it('searches a replacement’s candidates with no lock held when it supersedes a stale run', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    const stale = await reserveAutotaggerRun(fixture)
    await reviseWithEmbedding(fixture)()
    const observed: Array<'free' | 'held'> = []

    const replacement = await supersedeStaleClassifierRun(
      observeCandidateCaptureLock(adapter, observed),
      stale,
    )

    expect(observed).toEqual(['free'])
    expect(replacement).not.toBeNull()
    expect(replacement!.runId).not.toBe(stale.runId)
    expect(replacement!.inputSha256.equals(stale.inputSha256)).toBe(false)
  })
})
