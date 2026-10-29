import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { createTestPostgresMultiWait } from '@voucha/test-helpers/postgres-multi-client-lock-observer'
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
    let released: Promise<void> | undefined
    const releaseBlocker = () => (released ??= Promise.resolve(blocker[Symbol.asyncDispose]()))
    await using waits = await createTestPostgresMultiWait()
    const direct = await waits.start(
      {
        holderProcessId: pid,
        pool: 'write',
        lock: { kind: 'advisory', key: `post:${recommendation.id.toLowerCase()}` },
        queryMarker: 'lockPostPublicationScope',
        releaseHolder: releaseBlocker,
      },
      () =>
        updateTopicRecommendation(admin, recommendation, {
          topic_hostnames: [replacement],
        }).then(
          value => ({ value }),
          (err: unknown) => ({ err }),
        ),
    )
    await direct.waitForLock()
    const directWaiterPid = await direct.waiterProcessId()
    const indirect = await waits.start(
      {
        holderProcessId: directWaiterPid,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'lockTopicRecommendationForMutation',
        releaseHolder: releaseBlocker,
      },
      () =>
        approveTopicRecommendation(admin, WEB_PROVENANCE, recommendation).then(
          value => ({ value }),
          (err: unknown) => ({ err }),
        ),
    )
    await indirect.waitForLock()
    await blocker.commit()
    expect(await direct.operation).toHaveProperty('value')
    const approved = await indirect.operation
    expect(approved).toHaveProperty('value')
    if (!('value' in approved)) throw approved.err
    expect(await getActiveLandingPageHostnameClaims([ids.get(replacement)!])).toEqual([
      approved.value.topic_id,
    ])
    expect(await getActiveLandingPageHostnameClaims([ids.get(original)!])).toEqual([])
  })
})
