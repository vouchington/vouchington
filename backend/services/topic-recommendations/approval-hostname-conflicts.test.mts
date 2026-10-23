import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
  WEB_PROVENANCE,
  beginTransaction,
} from '@voucha/test-helpers'
import { createTopicRecommendation, approveTopicRecommendation } from './index.mts'
import { getPostByAny } from '@services/posts'
import { getTopicByAny } from '@services/topics'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { createTopicRecommendationRelations } from './create-topic-recommendation-link-relation.mts'

describe('approval hostname conflicts', () => {
  it('rejects a hostname batch when a competing transaction committed a later hostname', async () => {
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
    await using competingQuery = await beginTransaction()
    await createTopicRecommendationRelations(otherAdmin, competitor, [later], {
      query: competingQuery,
    })
    await competingQuery.commit()
    await using query = await beginTransaction()
    await expect(
      createTopicRecommendationRelations(admin, topic, [first, later], { query }),
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

  it('makes a concurrent claim wait until the hostname ownership lock commits', async () => {
    const admin = await createTestUser({ administrator: true })
    const otherAdmin = await createTestUser({ administrator: true })
    const topic = (await getTopicByAny((await createTestTopic({ user: admin })).id))!
    const competitor = (await getTopicByAny((await createTestTopic({ user: otherAdmin })).id))!
    const hostname = `owned-${crypto.randomUUID()}.example.com`
    const ids = await upsertUrlHostnames(admin.id, [hostname])
    const host = { id: ids.get(hostname)!, hostname }
    await using holder = await beginTransaction()
    await createTopicRecommendationRelations(admin, topic, [host], { query: holder })
    const holderPid = await getTestPostgresBackendProcessId(holder)
    await using claimTx = await beginTransaction()
    const claim = createTopicRecommendationRelations(otherAdmin, competitor, [host], {
      query: claimTx,
    }).then(
      () => {
        throw new Error('The competing hostname claim should have been rejected')
      },
      (err: unknown) => err,
    )
    await waitForTestPostgresLockWaiter(holderPid, 'lockHostnameOwnership')
    await holder.commit()
    await expect(claim).resolves.toMatchObject({
      status: 422,
      message: `Hostname ${hostname} is already associated with another topic`,
    })
  })
})
