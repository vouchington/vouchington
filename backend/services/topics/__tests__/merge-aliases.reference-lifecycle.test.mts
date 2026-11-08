import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  createReferralProgramFixture,
  disableReferralProgramByTopicId,
} from '@voucha/test-helpers/entities/referral-programs'
import { setReferralProgramActiveLinkCountForTest } from '@voucha/test-helpers/entities/referral-program-link-counts'
import { mergeTopicForTest, softDeleteTopic } from '@voucha/test-helpers/entities/topics'
import {
  getTopicReferenceGuardCoverage,
  getActiveTopicReferenceGuardFollows,
  insertTopicReferenceGuardFollow,
  reenableTopicReferenceGuardProgram,
  updateTopicReferenceGuardFollow,
  withTopicReferenceGuardFence,
  withTopicAttachmentFence,
} from '@voucha/test-helpers/topic-reference-guard'
import { getTopicMergeRelations } from '@voucha/test-helpers/topic-merge-references'
import {
  upsertBookmarkAction,
  deleteBookmarkAction,
} from '../../entity-relation-actions/bookmark.mts'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
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
        TOPIC_MERGE_REFERENCE_GROUPS[key] !== 'history' &&
        TOPIC_MERGE_REFERENCE_GROUPS[key] !== 'derived' &&
        key !== 'topics.merged_into_topic_id'
      expect({ key, guarded: row.guarded }).toEqual({ key, guarded: shouldGuard })
    }
  })

  it('preserves the canonical foreign key error for missing topics', async () => {
    const user = await createTestUser()
    await expect(
      insertTopicReferenceGuardFollow(
        `00000000-0000-7000-8000-${randomUUID().slice(-12)}`,
        user.id,
      ),
    ).rejects.toMatchObject({
      code: '23503',
    })
  })

  it('allows ordinary references while stats or feed updates hold the attachment fence', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    await withTopicAttachmentFence(topic.id, () =>
      insertTopicReferenceGuardFollow(topic.id, user.id),
    )
    await expect(getActiveTopicReferenceGuardFollows([topic.id], user.id)).resolves.toEqual([
      { object_id: topic.id },
    ])
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

  it('rejects an update that retains an inactive topic reference', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    await insertTopicReferenceGuardFollow(topic.id, user.id)
    await softDeleteTopic(topic.id, user.id)

    await expect(updateTopicReferenceGuardFollow(topic.id, user.id)).rejects.toMatchObject({
      status: 409,
      code: 'topic_reference_inactive',
      topic_id: topic.id,
    })
  })

  it.each(['deleted', 'merged'] as const)(
    'rejects re-enabling a %s referral program through its retained topic id',
    async lifecycle => {
      const user = await createTestUser()
      const program = await createReferralProgramFixture({ createdById: user.id })
      await disableReferralProgramByTopicId(program.referralProgramId)
      if (lifecycle === 'deleted') {
        await softDeleteTopic(program.referralProgramId, user.id)
      } else {
        const destination = await createTestTopic({ user })
        await mergeTopicForTest(program.referralProgramId, destination.id, user.id)
      }

      await expect(
        reenableTopicReferenceGuardProgram(program.referralProgramId),
      ).rejects.toMatchObject({
        status: 409,
        code: 'topic_reference_inactive',
        topic_id: program.referralProgramId,
      })
      await expect(
        setReferralProgramActiveLinkCountForTest(program.referralProgramId, 0),
      ).rejects.toMatchObject({
        status: 409,
        code: 'topic_reference_inactive',
        topic_id: program.referralProgramId,
      })
    },
  )
})
