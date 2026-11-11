import { createTestTopicRecommendation } from '@voucha/test-helpers/topic-recommendation-fixtures'
import { describe, expect, it } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { getActiveLandingPageHostnameClaims } from '@voucha/test-helpers/hostname-ownership'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import {
  prepareTopicRecommendation,
  approveTopicRecommendation,
  updateTopicRecommendation,
} from './index.mts'

describe('approval sees committed recommendation hostname edits', () => {
  it('approves the hostnames committed by the recommendation edit', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const original = `original-${suffix}.example.com`
    const replacement = `replacement-${suffix}.example.com`
    const ids = await upsertUrlHostnames(admin.id, [original, replacement])
    const recommendation = await createTestTopicRecommendation(
      prepareTopicRecommendation,
      admin,
      WEB_PROVENANCE,
      {
        markdown: 'Committed edit',
        topic_title: `Edit ${suffix}`,
        topic_slug: `edit-${suffix}`,
        topic_hostnames: [original],
      },
    )
    await updateTopicRecommendation(admin, recommendation, {
      topic_hostnames: [replacement],
    })
    const approved = await approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation)
    expect(await getActiveLandingPageHostnameClaims([ids.get(replacement)!])).toEqual([
      approved.topic_id,
    ])
    expect(await getActiveLandingPageHostnameClaims([ids.get(original)!])).toEqual([])
  })
})
