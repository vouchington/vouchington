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

import { refreshRecommendationVoteStats } from '../../../test-helpers/services/topic-recommendations/vote-stats.mts'

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
    it('rejects create requests that omit required fields with 422s', async () => {
      await expect(
        createTopicRecommendation(user, {
          markdown: '',
          topic_title: 'Missing slug topic',
        } as CreateTopicRecommendationInput),
      ).rejects.toMatchObject({ status: 422 })

      await expect(
        createTopicRecommendation(user, {
          markdown: 'Valid rationale',
          topic_slug: `missing-title-${Date.now()}`,
        } as CreateTopicRecommendationInput),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('creates a topic recommendation with extension payload', async () => {
      const stamp = Date.now()
      const recommendation = await createTopicRecommendation(user, {
        title: 'Request a topic',
        markdown: 'We need a dedicated topic for this program.',
        topic_title: `Service Test Topic ${stamp}`,
        topic_slug: `service-test-topic-${stamp}`,
        topic_markdown: 'Suggested topic body.',
        topic_hostname: `service-test-topic-${stamp}.example.com`,
        topic_hostnames: [`service-test-topic-${stamp}.example.com`],
        topic_aliases: ['service topic alias'],
      })
      expect(recommendation.post_type).toBe('topic_recommendation')
      expect(recommendation.topic_recommendation?.hostnames.length).toBeGreaterThan(0)
      expect(recommendation.topic_recommendation?.aliases).toEqual(['service topic alias'])
    })

    it('allows the creator to update a pending recommendation', async () => {
      const recommendation = await createTopicRecommendation(user, {
        markdown: 'Original rationale',
        topic_title: 'Original Topic Title',
        topic_slug: `editable-topic-${Date.now()}`,
      })
      const updated = await updateTopicRecommendation(user, recommendation, {
        markdown: 'Updated rationale',
        topic_title: 'Updated Topic Title',
        topic_markdown: 'Expanded topic markdown',
        topic_hostnames: [`updated-topic-${Date.now()}.example.com`],
      })

      expect(updated.markdown).toBe('Updated rationale')
      expect(updated.topic_recommendation?.topic_title).toBe('Updated Topic Title')
      expect(updated.topic_recommendation?.topic_markdown).toBe('Expanded topic markdown')
    })

    it('does not overwrite newer recommendation fields when a stale patch updates only payload fields', async () => {
      const recommendation = await createTopicRecommendation(user, {
        markdown: 'Original rationale',
        topic_title: 'Original Topic Title',
        topic_slug: `stale-update-topic-${Date.now()}`,
      })
      const renamed = await updateTopicRecommendation(user, recommendation, {
        topic_title: 'Fresh Topic Title',
        topic_slug: `fresh-topic-slug-${Date.now()}`,
      })
      const updated = await updateTopicRecommendation(user, recommendation, {
        topic_markdown: 'Fresh markdown only',
      })

      expect(renamed.topic_recommendation?.topic_title).toBe('Fresh Topic Title')
      expect(updated.topic_recommendation?.topic_title).toBe('Fresh Topic Title')
      expect(updated.topic_recommendation?.topic_slug).toBe(
        renamed.topic_recommendation?.topic_slug,
      )
      expect(updated.topic_recommendation?.topic_markdown).toBe('Fresh markdown only')
    })

    it('does not revert the locked primary hostname during partial updates', async () => {
      const recommendation = await createTopicRecommendation(user, {
        markdown: 'Original rationale',
        topic_title: 'Original Topic Title',
        topic_slug: `stale-hostname-topic-${Date.now()}`,
        topic_hostname: `original-${Date.now()}.example.com`,
      })
      const latestHostname = `latest-${Date.now()}.example.com`
      await updateTopicRecommendation(user, recommendation, {
        topic_hostname: latestHostname,
        topic_hostnames: [latestHostname],
      })

      const updated = await updateTopicRecommendation(user, recommendation, {
        topic_markdown: 'Hostname should stay latest',
      })

      expect(updated.topic_recommendation?.hostname?.hostname).toBe(latestHostname)
      expect(updated.topic_recommendation?.hostnames.map(hostname => hostname.hostname)).toEqual([
        latestHostname,
      ])
    })

    it('lets the creator withdraw a pending recommendation', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Withdraw this recommendation ${random}`,
        topic_title: `Withdrawable Topic ${random}`,
        topic_slug: `withdrawable-topic-${Date.now()}-${random}`,
      })

      await deletePendingRecommendation(user, recommendation)

      expect(await getPostByAny(recommendation.id)).toBeNull()
      const result = await searchTopicRecommendations({ q: random })
      expect(result.results.map(item => item.id)).not.toContain(recommendation.id)
    })

    it('uses the actual withdraw actor in the stored rejection reason', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Admin withdraw this recommendation ${random}`,
        topic_title: `Admin Withdrawable Topic ${random}`,
        topic_slug: `admin-withdrawable-topic-${Date.now()}-${random}`,
      })

      expect(getWithdrawRejectionReason(user, recommendation)).toBe('Withdrawn by author')
      expect(getWithdrawRejectionReason(admin, recommendation)).toBe('Withdrawn by admin')
    })

    it('rejects withdraw for other users and reviewed recommendations', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Not yours ${random}`,
        topic_title: `Not Yours Topic ${random}`,
        topic_slug: `not-yours-topic-${Date.now()}-${random}`,
      })

      await expect(deletePendingRecommendation(otherUser, recommendation)).rejects.toMatchObject({
        status: 403,
      })

      const rejected = await rejectTopicRecommendation(admin, recommendation, 'Duplicate')
      await expect(deletePendingRecommendation(user, recommendation)).rejects.toMatchObject({
        status: 403,
      })
      await expect(deletePendingRecommendation(user, rejected)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('orders search results by best score', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const lowScore = await createTopicRecommendation(user, {
        markdown: `Lower score ${random}`,
        topic_title: `Low Score Topic ${random}`,
        topic_slug: `low-score-topic-${Date.now()}-${random}`,
      })
      const highScore = await createTopicRecommendation(user, {
        markdown: `Higher score ${random}`,
        topic_title: `High Score Topic ${random}`,
        topic_slug: `high-score-topic-${Date.now()}-${random}`,
      })
      await upsertPostElectionVotes(user.id, [{ entityId: lowScore.id, score: 1 }])
      await upsertPostElectionVotes(user.id, [{ entityId: highScore.id, score: 1 }])
      await upsertPostElectionVotes(otherUser.id, [{ entityId: highScore.id, score: 1 }])
      await refreshRecommendationVoteStats({
        lowScoreId: lowScore.id,
        highScoreId: highScore.id,
      })

      // Use q filter with the unique random string to avoid accumulated data pushing results out
      const result = await searchTopicRecommendations({ q: random, limit: 10 })
      const lowIndex = result.results.findIndex((item: { id: string }) => item.id === lowScore.id)
      const highIndex = result.results.findIndex((item: { id: string }) => item.id === highScore.id)

      expect(highIndex).toBeGreaterThanOrEqual(0)
      expect(lowIndex).toBeGreaterThanOrEqual(0)
      expect(highIndex).toBeLessThan(lowIndex)
    })

    it('finds recommendations by id for admin review deep links', async () => {
      const random = Math.random().toString(36).slice(2, 10)
      const recommendation = await createTopicRecommendation(user, {
        markdown: `Search by id fallback ${random}`,
        topic_title: `Deep Link Topic ${random}`,
        topic_slug: `deep-link-topic-${Date.now()}-${random}`,
      })

      const result = await searchTopicRecommendations({ q: recommendation.id })

      expect(result.results.map(item => item.id)).toContain(recommendation.id)
    })

    it('treats wildcard characters in q as literals', async () => {
      const literal = await createTopicRecommendation(user, {
        markdown: 'Contains a literal 100% match and foo_bar token.',
        topic_title: 'Literal 100% Topic',
        topic_slug: `literal-100-percent-topic-${Date.now()}`,
      })
      const wildcardOnly = await createTopicRecommendation(user, {
        markdown: 'Contains 1000 percent match and fooXbar token.',
        topic_title: 'Literal 1000 Topic',
        topic_slug: `literal-1000-topic-${Date.now()}`,
      })
      const percentResult = await searchTopicRecommendations({ q: '100%' })
      expect(percentResult.results.map(result => result.id)).toContain(literal.id)
      expect(percentResult.results.map(result => result.id)).not.toContain(wildcardOnly.id)

      const underscoreResult = await searchTopicRecommendations({ q: 'foo_bar' })
      expect(underscoreResult.results.map(result => result.id)).toContain(literal.id)
      expect(underscoreResult.results.map(result => result.id)).not.toContain(wildcardOnly.id)
    })
  })

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestTopic)
  void (0 as unknown as typeof getPostByAnyCached)
  void (0 as unknown as typeof createTopicAliases)
  void (0 as unknown as typeof getTopicByAny)
  void (0 as unknown as typeof approveTopicRecommendation)
})
