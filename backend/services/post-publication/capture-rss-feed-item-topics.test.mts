import { rejectQueueJobAddForTest } from '@voucha/test-helpers/injected-queue-failures'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  addRssFeedItemSource,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScopes } from '@voucha/test-helpers/publication-effect-jobs'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { softDeleteRssFeedById } from '../rss-feeds/delete.mts'
import { processApplyPostPublicationEffects } from '../../workers/post-publication/processors/direct-effects.mts'
import { postPublicationWorkConfig } from './work-limits.mts'
import { recordRssFeedItemTopicPublicationChanges } from './capture-rss-feed-item-topics.mts'

describe('RSS item topic publication capture', () => {
  it('couples bounded topic chunks to one replayable source chain and retains deleted feed effects', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 1 }),
    )
    const feedTopics = await Promise.all(
      [0, 1, 2].map(() => createTestTopic({ name: randomUUID() })),
    )
    const feeds = await Promise.all(
      feedTopics.map(async topic => ({
        ...(await insertTestRssFeedDirect({ topicId: topic.id })),
        topicId: topic.id,
      })),
    )
    feeds.sort((a, b) => a.id.localeCompare(b.id))
    const item = await createTestRssFeedItemWithUrl(feeds[0]!.id)
    await Promise.all(feeds.slice(1).map(feed => addRssFeedItemSource(feed.id, item.id)))
    const topics = await Promise.all([0, 1].map(() => createTestTopic({ name: randomUUID() })))
    const topicIds = topics.map(topic => topic.id).toSorted()
    const before = await captureAddedPublicationEffectsForScopes([feeds[0]!.id], () =>
      softDeleteRssFeedById(feeds[0]!.id),
    )
    expect(before.flatMap(job => job.keys)).toContainEqual({
      kind: 'identity_rss_feed',
      uuidValue: feeds[0]!.id,
    })
    const capture = (commit: boolean) =>
      captureAddedPublicationEffectsForScopes(
        topicIds,
        async () => {
          await using query = await beginTransaction()
          recordRssFeedItemTopicPublicationChanges(query, [
            { rssFeedItemId: item.id, impactedTopicIds: topicIds },
          ])
          if (commit) await query.commit()
        },
        true,
      )
    expect(await capture(false)).toEqual([])
    const captured = await capture(true)
    expect(captured).toHaveLength(2)
    expect(captured.map(job => job.keys.length)).toEqual([1, 1])
    expect(captured.flatMap(job => job.keys)).toEqual(
      topicIds.map(uuidValue => ({ kind: 'impact_topic', uuidValue })),
    )
    const sources = captured.filter(job => job.continuation?.kind === 'topic_merge_item_sources')
    expect(sources).toHaveLength(1)
    const source = sources[0]!
    expect(source.continuation?.subjectIds).toEqual([item.id])
    expect(source.includeDeletedSourceFeeds).toBe(true)
    await captureAddedPublicationEffectsForScopes(
      topicIds,
      () => processApplyPostPublicationEffects(captured.find(job => !job.continuation)!),
      true,
    )
    const removed = await captureAddedPublicationEffectsForScopes([feeds[1]!.id], () =>
      softDeleteRssFeedById(feeds[1]!.id),
    )
    expect(removed.flatMap(job => job.keys)).toContainEqual({
      kind: 'identity_rss_feed',
      uuidValue: feeds[1]!.id,
    })
    const admissionError = new Error('Owned source handoff admission failed')
    const restore = rejectQueueJobAddForTest(
      backgroundQueue,
      (_name, data) => {
        const payload = data as PostPublicationEffectsJobData
        return (
          payload.scope?.id === source.scope.id &&
          payload.keys.length === 0 &&
          payload.continuation?.kind === 'topic_merge_item_sources' &&
          payload.continuation.after === null
        )
      },
      admissionError,
    )
    try {
      await captureAddedPublicationEffectsForScopes(
        topicIds,
        async () => {
          await expect(processApplyPostPublicationEffects(source)).rejects.toBe(admissionError)
        },
        true,
      )
    } finally {
      restore()
    }
    const replay = await captureAddedPublicationEffectsForScopes(
      topicIds,
      () => processApplyPostPublicationEffects(source),
      true,
    )
    const ready = replay.find(job => job.continuation?.kind === 'topic_merge_item_sources')!
    expect(ready.keys).toEqual([])
    expect(ready.scopeTopicKeysCaptured).toBe(false)
    const first = await captureAddedPublicationEffectsForScopes(
      topicIds,
      () => processApplyPostPublicationEffects(ready),
      true,
    )
    expect(
      first
        .filter(job => job.continuation?.kind === 'rss_feed_items')
        .flatMap(job => job.continuation!.subjectIds),
    ).toEqual([feeds[0]!.id])
    expect(
      first
        .filter(job => job.continuation?.kind === 'topic_aliases')
        .flatMap(job => job.continuation!.subjectIds),
    ).toContain(feeds[0]!.topicId)
    const next = first.find(job => job.continuation?.kind === 'topic_merge_item_sources')!
    const second = await captureAddedPublicationEffectsForScopes(
      topicIds,
      () => processApplyPostPublicationEffects(next),
      true,
    )
    expect(
      second
        .filter(job => job.continuation?.kind === 'rss_feed_items')
        .flatMap(job => job.continuation!.subjectIds),
    ).toEqual([feeds[1]!.id])
    expect(topicIds).not.toContain(feeds[1]!.topicId)
    expect(
      second
        .filter(job => job.continuation?.kind === 'topic_aliases')
        .flatMap(job => job.continuation!.subjectIds),
    ).toContain(feeds[1]!.topicId)
    const finalPage = second.find(job => job.continuation?.kind === 'topic_merge_item_sources')!
    const final = await captureAddedPublicationEffectsForScopes(
      topicIds,
      () => processApplyPostPublicationEffects(finalPage),
      true,
    )
    expect(
      final
        .filter(job => job.continuation?.kind === 'rss_feed_items')
        .flatMap(job => job.continuation!.subjectIds),
    ).toEqual([feeds[2]!.id])
    expect(final.some(job => job.continuation?.kind === 'topic_merge_item_sources')).toBe(false)
  })
})
