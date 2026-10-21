import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  getTopicReferenceGuardCoverage,
  getActiveTopicReferenceGuardFollows,
  insertTopicReferenceGuardFollow,
  withTopicReferenceGuardFence,
} from '@voucha/test-helpers/topic-reference-guard'
import { getTopicMergeRelations } from '@voucha/test-helpers/topic-merge-references'
import {
  upsertBookmarkAction,
  deleteBookmarkAction,
} from '../../entity-relation-actions/bookmark.mts'
import { mergeTopicAliases } from '../merge-aliases.mts'
import { getTopicByAny } from '../get.mts'
import { TOPIC_MERGE_REFERENCE_GROUPS } from '../merge-reference-inventory.mts'

describe('topic merge reference lifecycle', () => {
  it('guards every current reference while preserving source history and redirects', async () => {
    const coverage = await getTopicReferenceGuardCoverage()
    expect(coverage.map(row => `${row.table_name}.${row.column_name}`).toSorted()).toEqual(
      Object.keys(TOPIC_MERGE_REFERENCE_GROUPS).toSorted(),
    )
    for (const row of coverage) {
      const key =
        `${row.table_name}.${row.column_name}` as keyof typeof TOPIC_MERGE_REFERENCE_GROUPS
      const shouldGuard =
        TOPIC_MERGE_REFERENCE_GROUPS[key] !== 'history' && key !== 'topics.merged_into_topic_id'
      expect({ key, guarded: row.guarded }).toEqual({ key, guarded: shouldGuard })
    }
  })

  it('rejects a contending new reference instead of waiting behind publication locks', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    await withTopicReferenceGuardFence(topic.id, async () => {
      await expect(insertTopicReferenceGuardFollow(topic.id, user.id)).rejects.toMatchObject({
        status: 409,
        code: 'topic_reference_busy',
        topic_id: topic.id,
      })
    })
    await insertTopicReferenceGuardFollow(topic.id, user.id)
    await expect(getTopicMergeRelations(topic.id, topic.id, user.id)).resolves.toMatchObject({
      follows: [{ object_id: topic.id }],
    })
  })

  it('rejects stale writes after a merge and bookmarks the canonical destination', async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user })
    const destination = await createTestTopic({ user })
    const [fullSource, fullDestination] = await Promise.all([
      getTopicByAny(source.id),
      getTopicByAny(destination.id),
    ])
    await mergeTopicAliases(user, fullSource!, fullDestination!)
    await expect(insertTopicReferenceGuardFollow(source.id, user.id)).rejects.toMatchObject({
      status: 409,
      code: 'topic_reference_inactive',
      topic_id: source.id,
    })
    await upsertBookmarkAction(
      user,
      { kind: 'first_party' },
      {
        entityType: 'topic',
        entityId: source.id,
        predicate: 'follow',
      },
    )
    await expect(getTopicMergeRelations(source.id, destination.id, user.id)).resolves.toMatchObject(
      {
        follows: [{ object_id: destination.id }],
      },
    )
    await deleteBookmarkAction(user, {
      entityType: 'topic',
      entityId: source.id,
      predicate: 'follow',
    })
    await expect(
      getActiveTopicReferenceGuardFollows([source.id, destination.id], user.id),
    ).resolves.toEqual([])
  })
})
