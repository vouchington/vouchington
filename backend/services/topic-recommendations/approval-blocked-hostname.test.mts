import { describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE, updateUrlHostnameBlocked } from '@voucha/test-helpers'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { getPostByAny } from '@services/posts'
import { getTopicByAny } from '@services/topics'
import { approveTopicRecommendation, createTopicRecommendation } from './index.mts'

describe('approval blocked hostname', () => {
  it('rolls back the whole approval when one proposed hostname is blocked', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const openHostname = `open-${suffix}.example.com`
    const blockedHostname = `blocked-${suffix}.example.com`
    const slug = `blocked-approval-${suffix}`
    const recommendation = await createTopicRecommendation(admin, WEB_PROVENANCE, {
      markdown: 'One of two proposed hostnames is blocked',
      topic_title: `Blocked ${suffix}`,
      topic_slug: slug,
      topic_hostnames: [openHostname, blockedHostname],
    })
    const ids = await upsertUrlHostnames(admin.id, [blockedHostname])
    await updateUrlHostnameBlocked(ids.get(blockedHostname)!, true)

    await expect(
      approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation),
    ).rejects.toMatchObject({
      status: 400,
      message: `Domain is blocked: ${blockedHostname}`,
    })

    expect(await getTopicByAny(slug)).toBeNull()
    expect((await getPostByAny(recommendation.id))?.topic_recommendation).toMatchObject({
      status: 'pending',
    })
  })
})
