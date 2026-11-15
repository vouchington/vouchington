import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postPublicationWorkConfig } from './work-limits.mts'
import { processApplyPostPublicationEffects } from '../../workers/post-publication/processors/direct-effects.mts'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  getTestRssFeedItemCategorySnapshotReconciliation,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScopes } from '@voucha/test-helpers/publication-effect-jobs'
import {
  rejectOwnedPublicationAdmission,
  acceptOwnedPublicationPrefixThenReject,
} from '@voucha/test-helpers/publication-admission-fault'
import { markRssFeedItemCategorySnapshotsForReconciliation } from '../rss-feed-items/category-snapshot-reconciliations.mts'
import { recordRssFeedItemTopicPublicationChanges } from './capture-rss-feed-item-topics.mts'

describe('RSS topic publication admission failure semantics', () => {
  it('keeps the committed snapshot after failed admission and accepts a later capture', async () => {
    const feed = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(feed.id)
    const topic = await createTestTopic({ name: randomUUID() })
    const scopes = [feed.id, topic.id]
    const publish = async () => {
      await using query = await beginTransaction()
      await markRssFeedItemCategorySnapshotsForReconciliation(query, [item.id])
      recordRssFeedItemTopicPublicationChanges(query, [
        { rssFeedItemId: item.id, impactedTopicIds: [topic.id] },
      ])
      await query.commit()
    }
    const restore = rejectOwnedPublicationAdmission(
      scopes,
      new Error('Owned publication admission failed'),
    )
    try {
      expect(await captureAddedPublicationEffectsForScopes(scopes, publish, true)).toEqual([])
    } finally {
      restore()
    }
    // Post-commit admission failure is reported while the writer remains committed.
    await expect(getTestRssFeedItemCategorySnapshotReconciliation(item.id)).resolves.toBeDefined()
    const admitted = await captureAddedPublicationEffectsForScopes(scopes, publish, true)
    expect(admitted).toHaveLength(1)
    expect(admitted[0]!.keys).toContainEqual({ kind: 'impact_topic', uuidValue: topic.id })
    expect(admitted[0]!.continuation?.kind).toBe('topic_merge_item_sources')
    expect(admitted[0]!.continuation?.subjectIds).toEqual([item.id])
  })
  it('keeps feed discovery in an accepted bulk prefix and replays its owner effects', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 1 }),
    )
    const owner = await createTestTopic({ name: randomUUID() })
    const feed = await insertTestRssFeedDirect({ topicId: owner.id })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    const categoryTopics = await Promise.all(
      [0, 1].map(() => createTestTopic({ name: randomUUID() })),
    )
    const topicIds = categoryTopics.map(topic => topic.id).toSorted()
    const scopeId = topicIds[0]!
    const restore = acceptOwnedPublicationPrefixThenReject(
      scopeId,
      new Error('Owned partial publication bulk failure'),
    )
    let prefix
    try {
      prefix = await captureAddedPublicationEffectsForScopes(
        [scopeId],
        async () => {
          await using query = await beginTransaction()
          recordRssFeedItemTopicPublicationChanges(query, [
            { rssFeedItemId: item.id, impactedTopicIds: topicIds },
          ])
          await query.commit()
        },
        true,
      )
    } finally {
      restore()
    }
    expect(prefix).toHaveLength(1)
    const accepted = prefix[0]!
    expect(accepted.chunkIndex).toBe(0)
    expect(accepted.keys).toEqual([{ kind: 'impact_topic', uuidValue: topicIds[0] }])
    expect(accepted.continuation?.subjectIds).toEqual([item.id])
    const first = await captureAddedPublicationEffectsForScopes(
      [scopeId],
      () => processApplyPostPublicationEffects(accepted),
      true,
    )
    const replay = await captureAddedPublicationEffectsForScopes(
      [scopeId],
      () => processApplyPostPublicationEffects(accepted),
      true,
    )
    const next = first.find(job => job.continuation?.kind === 'topic_merge_item_sources')!
    expect(next.keys).toEqual([])
    expect(replay.find(job => job.continuation?.kind === 'topic_merge_item_sources')).toEqual(next)
    const effects = await captureAddedPublicationEffectsForScopes(
      [scopeId],
      () => processApplyPostPublicationEffects(next),
      true,
    )
    expect(
      effects
        .filter(job => job.continuation?.kind === 'rss_feed_items')
        .flatMap(job => job.continuation!.subjectIds),
    ).toEqual([feed.id])
    expect(topicIds).not.toContain(owner.id)
    expect(
      effects
        .filter(job => job.continuation?.kind === 'topic_aliases')
        .flatMap(job => job.continuation!.subjectIds),
    ).toContain(owner.id)
    expect(effects.some(job => job.continuation?.kind === 'topic_merge_item_sources')).toBe(false)
    const replayedEffects = await captureAddedPublicationEffectsForScopes(
      [scopeId],
      () => processApplyPostPublicationEffects(next),
      true,
    )
    expect(
      replayedEffects
        .filter(job => job.continuation?.kind === 'rss_feed_items')
        .flatMap(job => job.continuation!.subjectIds),
    ).toEqual([feed.id])
    expect(
      replayedEffects
        .filter(job => job.continuation?.kind === 'topic_aliases')
        .flatMap(job => job.continuation!.subjectIds),
    ).toContain(owner.id)
  })
})
