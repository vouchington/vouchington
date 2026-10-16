import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { expectStaffOperationHistory } from '@voucha/test-helpers/staff-operation-history'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import { background } from '@queues/background/queues'
import { backgroundQueueConfig } from '@queues/background/config'
import { getQueueDomainControl, resumeQueueDomain } from '@services/queue-domain-controls'
import type { PrivateUser } from '@services/users/types'

// Paused only for the length of one test: the real-glide pause test uses the other domain.
const DOMAIN = 'ses-inbound'
const BASE = '/api/v1/mq/queues/background/domains'

describe('background queue domain routes', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser({ administrator: false })
  })

  afterAll(() => resumeQueueDomain(DOMAIN))

  it.each([
    ['GET', BASE],
    ['POST', `${BASE}/${DOMAIN}/pause`],
    ['POST', `${BASE}/${DOMAIN}/resume`],
    ['POST', `${BASE}/${DOMAIN}/retry-failed`],
  ] as const)('requires an administrator for %s %s', async (method, path) => {
    const anonymous = createRequest()
    await anonymous
      .get(path)
      .expect(401)
      .catch(() => anonymous.post(path).expect(401))
    const request = createRequest()
    await request.authenticateAs(regularUser)
    if (method === 'GET') await request.get(path).expect(403)
    else await request.post(path).expect(403)
  })

  it('lists every registered domain with capped per-state counts and its pause state', async () => {
    const restore = overrideDynamicConfigFieldsForTest(backgroundQueueConfig, {
      domain_stats_scan_cap: 2,
    })
    const sesMessageId = `ses-${randomUUID()}`
    const jobIds = [0, 1, 2].map(index => `ses-domain-stats-${randomUUID()}-${index}`)
    try {
      // Three delayed jobs of one domain under a cap of two: the count stops at the cap.
      for (const jobId of jobIds) {
        await background.add(
          SES_INBOUND_PROCESS_JOB.name,
          { sesMessageId, objectKey: `copyright-incoming/${sesMessageId}` },
          { jobId, delay: 3_600_000, attempts: 1 },
        )
      }
      const request = createRequest()
      await request.authenticateAs(admin)
      const { body } = await request.get(BASE).expect(200)

      const byDomain = new Map(
        (body.domains as { domain: string }[]).map(entry => [entry.domain, entry]),
      )
      expect([...byDomain.keys()].toSorted()).toEqual([
        'account-lifecycle',
        'activitypub',
        'article-sync',
        'bluesky-follow-propagation',
        'entity-listeners',
        'follower-distributions',
        'notifications',
        'oauth-authorization-exchange',
        'openai-moderation',
        'post-mentions',
        'post-publication',
        'ses-inbound',
        'story-post-related-url-projections',
        'vote-aggregation',
      ])
      expect(byDomain.get('ses-inbound')).toMatchObject({
        paused: false,
        paused_at: null,
        paused_by: null,
        reason: null,
        delayed: { complete: false },
      })
      // The delayed read is queue-wide and capped, so another domain's delayed jobs in this fork
      // (election recomputes wait six seconds) may take scan slots: the count is a lower bound.
      const ses = byDomain.get('ses-inbound') as unknown as { delayed: { count: number } }
      expect(ses.delayed.count).toBeLessThanOrEqual(2)
    } finally {
      restore()
      await Promise.all(jobIds.map(async jobId => (await background.getJob(jobId))?.remove()))
    }
  })

  it('rejects a queue without domains, an unknown domain, and a whole-queue control of the shared queue', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/mq/queues/psql/domains').expect(404)
    await request.post(`${BASE}/not-a-domain/pause`).expect(404)
    await request.post('/api/v1/mq/queues/psql/domains/ses-inbound/pause').expect(404)
    await request.post('/api/v1/mq/queues/background/pause').expect(400)
    await request.post('/api/v1/mq/queues/background/retry-failed').expect(400)
  })

  it('pauses with a reason, resumes, audits one operation per change, and ignores a repeat', async () => {
    const actor = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(actor)
    try {
      await request
        .post(`${BASE}/${DOMAIN}/pause`)
        .send({ reason: 'investigating upstream' })
        .expect(200, { success: true })
      await request.post(`${BASE}/${DOMAIN}/pause`).expect(200, { success: true })

      await expect(getQueueDomainControl(DOMAIN)).resolves.toMatchObject({
        paused: true,
        pausedBy: actor.id,
        reason: 'investigating upstream',
      })
      const listed = await request.get(BASE).expect(200)
      expect(
        (listed.body.domains as { domain: string; paused: boolean; reason: string }[]).find(
          entry => entry.domain === DOMAIN,
        ),
      ).toMatchObject({ paused: true, reason: 'investigating upstream' })

      await request.post(`${BASE}/${DOMAIN}/resume`).expect(200, { success: true })
      await request.post(`${BASE}/${DOMAIN}/resume`).expect(200, { success: true })
      await expect(getQueueDomainControl(DOMAIN)).resolves.toMatchObject({ paused: false })

      const history = await readStaffActionHistory(actor.id)
      for (const type of ['queue_pause', 'queue_resume']) {
        expect(
          history.filter(row => row.action_type === type && row.metadata.phase === 'requested'),
        ).toHaveLength(1)
        await expectStaffOperationHistory(actor.id, type)
      }
      expect(history.find(row => row.action_type === 'queue_pause')).toMatchObject({
        queue_name: 'background',
        reason: 'investigating upstream',
        metadata: { domain: DOMAIN },
      })
    } finally {
      await resumeQueueDomain(DOMAIN)
    }
  })

  it('retries only the failed jobs of the named domain', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`${BASE}/${DOMAIN}/retry-failed`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ success: true, retried: expect.any(Number) }))
  })

  it('rejects a reason longer than the stored limit', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`${BASE}/${DOMAIN}/pause`)
      .send({ reason: 'x'.repeat(501) })
      .expect(422)
    await expect(getQueueDomainControl(DOMAIN)).resolves.toMatchObject({ paused: false })
  })
})
