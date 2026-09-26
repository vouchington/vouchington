import { beforeAll, describe, expect, it } from 'vitest'

import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'

import { insertTestTopic } from '@voucha/test-helpers/entities/topics'

import { getPostByAnyCached } from '@services/entity-fetch'

import type { PrivateUser } from '@voucha/types/entities/user'

import { upsertPostElectionVotes } from '@services/elections-votes/post'

import { getPostByAny } from '@services/posts'

import { createTopicAliases } from '@services/topics/aliases'

import { getTopicByAny } from '@services/topics'

import type { CreateTopicRecommendationInput } from '../types.mts'

import {
  approveTopicRecommendation,
  createTopicRecommendation,
  deletePendingRecommendation,
  getWithdrawRejectionReason,
  rejectTopicRecommendation,
  searchTopicRecommendations,
  updateTopicRecommendation,
} from '../index.mts'

describe('index.generated', () => {
  let user: PrivateUser

  let admin: PrivateUser

  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
    otherUser = await createTestUser()
  })

  describe('topic recommendation services', () => {
    it('lets admins reject and approve recommendations', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const rejected = await createTopicRecommendation(WEB_PROVENANCE, user, {
        markdown: 'Reject me',
        topic_title: `Reject Me ${random}`,
        topic_slug: `reject-me-${Date.now()}-${random}`,
      })
      await getPostByAnyCached(rejected.id)

      const rejectedResult = await rejectTopicRecommendation(admin, rejected, 'Duplicate request')
      const rejectedCached = await getPostByAnyCached(rejected.id)
      expect(rejectedResult.topic_recommendation?.status).toBe('rejected')
      expect(rejectedResult.topic_recommendation?.rejection_reason).toBe('Duplicate request')
      expect(rejectedCached?.topic_recommendation?.status).toBe('rejected')

      const conflictAlias = `approve-me-alias-${random}`
      // Create the rec before the conflicting alias exists; insert alias after to test approval conflict.
      const conflictingRecommendation = await createTopicRecommendation(WEB_PROVENANCE, user, {
        markdown: 'Approve me with a conflicting alias',
        topic_title: `Approve Me Conflict ${random}`,
        topic_slug: `approve-me-conflict-${Date.now()}-${random}`,
        topic_markdown: 'Approved markdown',
        topic_hostnames: [`approve-me-conflict-${Date.now()}-${random}.example.com`],
        topic_aliases: [conflictAlias],
      })

      const existingAliasTopicId = await insertTestTopic({
        name: `Existing Alias Topic ${Date.now()}-${random}`,
        slug: `existing-alias-topic-${Date.now()}-${random}`,
        createdById: admin.id,
      })
      await createTopicAliases(existingAliasTopicId, conflictAlias)
      await getTopicByAny(conflictAlias)
      await expect(
        approveTopicRecommendation(WEB_PROVENANCE, admin, conflictingRecommendation),
      ).rejects.toThrow(/Alias already belongs to another topic/)

      const conflictPost = await getPostByAny(conflictingRecommendation.id)
      const existingAliasTopic = await getTopicByAny(conflictAlias)
      expect(conflictPost?.topic_recommendation?.status).toBe('pending')
      expect(conflictPost?.topic_recommendation?.approval_error_message).toMatch(
        /Alias already belongs to another topic/,
      )
      expect(existingAliasTopic?.id).toBe(existingAliasTopicId)

      const cleanAlias = `approve-me-clean-alias-${random}`
      const approved = await createTopicRecommendation(WEB_PROVENANCE, user, {
        markdown: 'Approve me',
        topic_title: `Approve Me Clean ${random}`,
        topic_slug: `approve-me-clean-${Date.now()}-${random}`,
        topic_markdown: 'Approved markdown',
        topic_hostname: `approve-me-clean-${Date.now()}-${random}.example.com`,
        topic_hostnames: [`approve-me-clean-${Date.now()}-${random}.example.com`],
        topic_aliases: [cleanAlias],
      })
      await getPostByAnyCached(approved.id)

      const approval = await approveTopicRecommendation(WEB_PROVENANCE, admin, approved)
      const createdTopic = await getTopicByAny(approval.topic_id)
      const refreshedPost = await getPostByAny(approved.id)
      const cachedApprovedPost = await getPostByAnyCached(approved.id)

      expect(createdTopic?.slug).toBe(approved.topic_recommendation?.topic_slug)
      expect(createdTopic?.created_by.id).toBe(admin.id)
      expect(createdTopic?.aliases).toContain(cleanAlias)
      expect(refreshedPost?.topic_recommendation?.status).toBe('approved')
      expect(cachedApprovedPost?.topic_recommendation?.status).toBe('approved')
    })

    it('approves using the latest locked recommendation fields instead of a stale snapshot', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(WEB_PROVENANCE, user, {
        markdown: 'Approve the latest version',
        topic_title: `Original Approval Title ${random}`,
        topic_slug: `stale-approval-original-${Date.now()}-${random}`,
        topic_aliases: [`stale-approval-alias-${random}`],
      })
      const latestSlug = `stale-approval-latest-${Date.now()}-${random}`
      const latestTitle = `Latest Approval Title ${random}`
      await updateTopicRecommendation(user, recommendation, {
        topic_title: latestTitle,
        topic_slug: latestSlug,
        topic_hostnames: [`latest-approval-${Date.now()}-${random}.example.com`],
      })

      const approval = await approveTopicRecommendation(WEB_PROVENANCE, admin, recommendation)
      const createdTopic = await getTopicByAny(approval.topic_id)
      const approvedPost = await getPostByAny(recommendation.id)

      expect(createdTopic?.name).toBe(latestTitle)
      expect(createdTopic?.slug).toBe(latestSlug)
      expect(createdTopic?.created_by.id).toBe(admin.id)
      expect(approvedPost?.topic_recommendation?.topic_title).toBe(latestTitle)
      expect(approvedPost?.topic_recommendation?.topic_slug).toBe(latestSlug)
    })
  })
  // keep generated shard bindings live for typecheck
  const keepCreateTopicRecommendationInput: CreateTopicRecommendationInput | null = null
  void (0 as unknown as typeof keepCreateTopicRecommendationInput)
  void (0 as unknown as typeof upsertPostElectionVotes)
  void (0 as unknown as typeof deletePendingRecommendation)
  void (0 as unknown as typeof getWithdrawRejectionReason)
  void (0 as unknown as typeof searchTopicRecommendations)
  void (0 as unknown as typeof otherUser)
})
