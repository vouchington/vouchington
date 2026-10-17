import { describe, expect, it } from 'vitest'
import { createTestUser, createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createTopicRecommendation, approveTopicRecommendation } from './index.mts'
import { getPostByAny } from '@services/posts'
import { getTopicByAny } from '@services/topics'
import { beginTransaction } from '@data-stores/psql'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { createTopicRecommendationLinkRelation } from './create-topic-recommendation-link-relation.mts'

describe('approval hostname conflicts', () => {
  it('rejects a later hostname associated by another transaction after an earlier write', async () => {
    const admin = await createTestUser({ administrator: true })
    const otherAdmin = await createTestUser({ administrator: true })
    const firstTopic = await createTestTopic({ user: admin })
    const otherTopic = await createTestTopic({ user: otherAdmin })
    const topic = (await getTopicByAny(firstTopic.id))!
    const competitor = (await getTopicByAny(otherTopic.id))!
    const suffix = crypto.randomUUID()
    const firstHostname = `first-race-${suffix}.example.com`
    const laterHostname = `later-race-${suffix}.example.com`
    const ids = await upsertUrlHostnames(admin.id, [firstHostname, laterHostname])
    const first = { id: ids.get(firstHostname)!, hostname: firstHostname }
    const later = { id: ids.get(laterHostname)!, hostname: laterHostname }
    await using query = await beginTransaction()
    await createTopicRecommendationLinkRelation(admin, topic, first, { query })
    await using competingQuery = await beginTransaction()
    await createTopicRecommendationLinkRelation(otherAdmin, competitor, later, {
      query: competingQuery,
    })
    await competingQuery.commit()
    await expect(
      createTopicRecommendationLinkRelation(admin, topic, later, { query }),
    ).rejects.toMatchObject({
      status: 422,
      message: `Hostname ${laterHostname} is already associated with another topic`,
    })
  })

  it('approves several hostnames and rolls back an earlier hostname when a later one conflicts', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const commonHostname = `common-${suffix}.example.com`
    const first = await createTopicRecommendation(admin, WEB_PROVENANCE, {
      markdown: 'First topic with two hostnames',
      topic_title: `First ${suffix}`,
      topic_slug: `first-${suffix}`,
      topic_hostnames: [`first-${suffix}.example.com`, commonHostname],
    })
    const secondSlug = `second-${suffix}`
    const second = await createTopicRecommendation(admin, WEB_PROVENANCE, {
      markdown: 'Second topic with a later conflicting hostname',
      topic_title: `Second ${suffix}`,
      topic_slug: secondSlug,
      topic_hostnames: [`second-${suffix}.example.com`, commonHostname],
    })
    const approved = await approveTopicRecommendation(admin, WEB_PROVENANCE, first)
    expect(approved.topic_slug).toBe(`first-${suffix}`)
    await expect(approveTopicRecommendation(admin, WEB_PROVENANCE, second)).rejects.toThrow(
      `Hostname ${commonHostname} is already associated with another topic`,
    )
    expect(await getTopicByAny(secondSlug)).toBeNull()
    expect((await getPostByAny(second.id))?.topic_recommendation).toMatchObject({
      status: 'pending',
      approval_error_message: `Hostname ${commonHostname} is already associated with another topic`,
    })
  })
})
