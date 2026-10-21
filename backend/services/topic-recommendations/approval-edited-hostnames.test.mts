import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
  waitForTestPostgresBlockedLockChain,
} from '@voucha/test-helpers/postgres-lock-wait'
import { getActiveLandingPageHostnameClaims } from '@voucha/test-helpers/hostname-ownership'
import { lockPostPublication } from '@services/post-publication'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import {
  createTopicRecommendation,
  approveTopicRecommendation,
  updateTopicRecommendation,
} from './index.mts'

describe('approval sees committed recommendation hostname edits', () => {
  it('reads the edited hostnames after waiting for the recommendation row fence', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const original = `original-${suffix}.example.com`
    const replacement = `replacement-${suffix}.example.com`
    const ids = await upsertUrlHostnames(admin.id, [original, replacement])
    const recommendation = await createTopicRecommendation(admin, WEB_PROVENANCE, {
      markdown: 'Concurrent edit',
      topic_title: `Edit ${suffix}`,
      topic_slug: `edit-${suffix}`,
      topic_hostnames: [original],
    })
    await using blocker = await beginTransaction()
    await lockPostPublication(blocker, recommendation.id)
    const pid = await getTestPostgresBackendProcessId(blocker)
    const edit = updateTopicRecommendation(admin, recommendation, {
      topic_hostnames: [replacement],
    }).then(
      value => ({ value }),
      (err: unknown) => ({ err }),
    )
    await waitForTestPostgresLockWaiter(pid, 'lockPostPublicationScope')
    const approval = approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation).then(
      value => ({ value }),
      (err: unknown) => ({ err }),
    )
    try {
      await waitForTestPostgresBlockedLockChain(pid, 'lockPostPublicationScope', [
        'lockTopicRecommendationForMutation',
      ])
    } finally {
      await blocker.commit()
    }
    expect(await edit).toHaveProperty('value')
    const approved = await approval
    expect(approved).toHaveProperty('value')
    if (!('value' in approved)) throw approved.err
    expect(await getActiveLandingPageHostnameClaims([ids.get(replacement)!])).toEqual([
      approved.value.topic_id,
    ])
    expect(await getActiveLandingPageHostnameClaims([ids.get(original)!])).toEqual([])
  })
})
