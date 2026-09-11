import { beforeAll, describe, expect, it } from 'vitest'

import { createTestUser } from '@voucha/test-helpers'

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
  createRecommendation,
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
      const rejected = await createTopicRecommendation(user, {
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
      const conflictingRecommendation = await createTopicRecommendation(user, {
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
      await expect(approveTopicRecommendation(admin, conflictingRecommendation)).rejects.toThrow(
        /Alias already belongs to another topic/,
      )

      const conflictPost = await getPostByAny(conflictingRecommendation.id)
      const existingAliasTopic = await getTopicByAny(conflictAlias)
      expect(conflictPost?.topic_recommendation?.status).toBe('pending')
      expect(conflictPost?.topic_recommendation?.approval_error_message).toMatch(
        /Alias already belongs to another topic/,
      )
      expect(existingAliasTopic?.id).toBe(existingAliasTopicId)

      const cleanAlias = `approve-me-clean-alias-${random}`
      const approved = await createTopicRecommendation(user, {
        markdown: 'Approve me',
        topic_title: `Approve Me Clean ${random}`,
        topic_slug: `approve-me-clean-${Date.now()}-${random}`,
        topic_markdown: 'Approved markdown',
        topic_hostname: `approve-me-clean-${Date.now()}-${random}.example.com`,
        topic_hostnames: [`approve-me-clean-${Date.now()}-${random}.example.com`],
        topic_aliases: [cleanAlias],
      })
      await getPostByAnyCached(approved.id)

      const approval = await approveTopicRecommendation(admin, approved)
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
      const recommendation = await createTopicRecommendation(user, {
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

      const approval = await approveTopicRecommendation(admin, recommendation)
      const createdTopic = await getTopicByAny(approval.topic_id)
      const approvedPost = await getPostByAny(recommendation.id)

      expect(createdTopic?.name).toBe(latestTitle)
      expect(createdTopic?.slug).toBe(latestSlug)
      expect(createdTopic?.created_by.id).toBe(admin.id)
      expect(approvedPost?.topic_recommendation?.topic_title).toBe(latestTitle)
      expect(approvedPost?.topic_recommendation?.topic_slug).toBe(latestSlug)
    })

    it('returns null when the compatibility create path hits a duplicate inside the write transaction', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const topicName = `Compatibility Duplicate Topic ${random}`
      const input = {
        source_entity_type: 'post' as const,
        source_entity_id: crypto.randomUUID(),
        wikipedia_pageid: `compatibility-page-${Date.now()}-${random}`,
        wikipedia_title: topicName,
        wikipedia_url: `https://en.wikipedia.org/wiki/Compatibility_Duplicate_Topic_${Date.now()}_${random}`,
        wikipedia_extract: 'Wikipedia extract',
        wikipedia_description: 'Wikipedia description',
        suggested_topic_name: topicName,
        suggested_topic_slug: `compatibility-duplicate-topic-${Date.now()}-${random}`,
        extraction_method: 'llm_extraction' as const,
        extraction_keyword: topicName,
        extraction_confidence: 0.9,
      }

      const created = await createRecommendation(user, input)
      expect(created).not.toBeNull()

      const duplicate = await createRecommendation(user, input)
      expect(duplicate).toBeNull()
    })

    it('rejects invalid compatibility confidence with a clear error', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const input = {
        source_entity_type: 'post' as const,
        source_entity_id: crypto.randomUUID(),
        wikipedia_pageid: `invalid-confidence-${random}`,
        wikipedia_title: `Invalid Confidence ${random}`,
        wikipedia_url: `https://en.wikipedia.org/wiki/Invalid_Confidence_${random}`,
        suggested_topic_name: `Invalid Confidence ${random}`,
        suggested_topic_slug: `invalid-confidence-${random}`,
        extraction_method: 'llm_extraction' as const,
        extraction_keyword: `Invalid Confidence ${random}`,
        extraction_confidence: 1.5,
      }

      await expect(createRecommendation(user, input)).rejects.toThrow(
        'extraction_confidence must be a finite number between 0 and 1',
      )
    })

    it('adds Wikipedia title to aliases when different from suggested topic name', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const input = {
        source_entity_type: 'post' as const,
        source_entity_id: crypto.randomUUID(),
        wikipedia_pageid: `different-title-${random}`,
        wikipedia_title: `Wikipedia Title ${random}`,
        wikipedia_url: `https://en.wikipedia.org/wiki/Wikipedia_Title_${random}`,
        suggested_topic_name: `Suggested Name ${random}`,
        suggested_topic_slug: `suggested-name-${random}`,
        extraction_method: 'llm_extraction' as const,
        extraction_keyword: `Suggested Name ${random}`,
        extraction_confidence: 0.9,
      }
      const result = await createRecommendation(user, input)
      expect(result).not.toBeNull()

      const rec = await getPostByAny(result!.id)
      expect(rec?.topic_recommendation?.aliases).toContain(`wikipedia title ${random}`)
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
