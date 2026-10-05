import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  counterNoticeBody,
  createCopyrightFormFixture,
  createNotice,
} from '@services/copyright-notices/route-test-fixtures'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const NOTICES = '/api/v1/copyright-notices'

async function createAppealFixture() {
  const fixture = await createCopyrightFormFixture()
  const noticeId = await createNotice(fixture)
  const targetId = await readCopyrightNoticeTargetId(noticeId)
  const poster = createRequest()
  await poster.authenticateAs(fixture.poster)
  return { fixture, noticeId, targetId, poster }
}

describe('copyright submission request contracts', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /copyright-notices', () => {
    type Form = Awaited<ReturnType<typeof createCopyrightFormFixture>>['form']
    it.each<[string, (target: Form['targets'][number]) => Record<string, unknown>, string]>([
      [
        'missing surface',
        target => ({ ...target, surface: undefined }),
        'targets[].surface is invalid',
      ],
      [
        'unknown surface',
        target => ({ ...target, surface: 'video-image' }),
        'targets[].surface is invalid',
      ],
      [
        'missing owner',
        target => ({ ...target, post_id: undefined }),
        'targets[].post_id must be a UUID',
      ],
      [
        'another branch owner',
        target => ({ ...target, user_id: crypto.randomUUID() }),
        'Invalid request body',
      ],
      ['extra key', target => ({ ...target, injected: true }), 'Invalid request body'],
    ])('rejects a target with %s before admission', async (_label, change, message) => {
      const { claimant, form } = await createCopyrightFormFixture()
      const request = createRequest()
      await request.authenticateAs(claimant)
      const response = await request
        .post(NOTICES)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ...form, targets: [change(form.targets[0]!)] })
        .expect(422)
      expect(response.body.message).toBe(message)
    })
    it.each<[string, (target: Record<string, unknown>) => Record<string, unknown>, string]>([
      [
        'missing surface',
        target => ({ ...target, surface: undefined }),
        'targets[].surface is invalid',
      ],
      [
        'unknown surface',
        target => ({ ...target, surface: 'video-image' }),
        'targets[].surface is invalid',
      ],
      [
        'missing branch owner',
        target => ({ ...target, community_id: undefined }),
        'targets[].community_id must be a UUID',
      ],
      [
        'wrong branch owner',
        target => ({ ...target, post_id: crypto.randomUUID() }),
        'Invalid request body',
      ],
      ['extra key', target => ({ ...target, injected: true }), 'Invalid request body'],
    ])('rejects a community image with %s', async (_label, mutate, message) => {
      const { claimant, form } = await createCopyrightFormFixture()
      const request = createRequest()
      await request.authenticateAs(claimant)
      const target = {
        surface: 'community-banner-image',
        community_id: crypto.randomUUID(),
        image_id: crypto.randomUUID(),
        target_url: 'https://voucha.ai/communities/example',
      }
      const response = await request
        .post(NOTICES)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ...form, targets: [mutate(target)] })
        .expect(422)
      expect(response.body.message).toBe(message)
    })
    it.each<[string, (form: Form) => object]>([
      ['an unknown key', form => ({ ...form, injected: true })],
      ['a non-string cf_turnstile_response', form => ({ ...form, cf_turnstile_response: 7 })],
      [
        'an unknown target key',
        form => ({ ...form, targets: [{ ...form.targets[0], injected: true }] }),
      ],
    ])('rejects %s with 422 and writes nothing', async (_label, mutate) => {
      const { claimant, form } = await createCopyrightFormFixture()
      const request = createRequest()
      await request.authenticateAs(claimant)
      const key = crypto.randomUUID()

      await request.post(NOTICES).set('Idempotency-Key', key).send(mutate(form)).expect(422)

      const retry = await request.post(NOTICES).set('Idempotency-Key', key).send(form).expect(202)
      expect(retry.body.is_duplicate).toBe(false)
    })

    it('keeps the Idempotency-Key 400 ahead of the schema diagnostic', async () => {
      const { claimant, form } = await createCopyrightFormFixture()
      const request = createRequest()
      await request.authenticateAs(claimant)

      const response = await request
        .post(NOTICES)
        .send({ ...form, injected: true })
        .expect(400)

      expect(response.body.message).toBe('Idempotency-Key must be a UUID')
    })

    it.each([
      ['has_good_faith_belief', { has_good_faith_belief: false }],
      [
        'has_accuracy_authority_under_penalty_of_perjury',
        { has_accuracy_authority_under_penalty_of_perjury: 'yes' },
      ],
    ])('keeps the field-named 422 for an unaccepted %s', async (field, override) => {
      const { claimant, form } = await createCopyrightFormFixture()
      const request = createRequest()
      await request.authenticateAs(claimant)

      const response = await request
        .post(NOTICES)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ...form, ...override })
        .expect(422)

      expect(response.body.message).toBe(`${field} must be accepted`)
    })

    it('accepts a valid form with the optional CAPTCHA token', async () => {
      const { claimant, form } = await createCopyrightFormFixture()
      const request = createRequest()
      await request.authenticateAs(claimant)

      await request
        .post(NOTICES)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ...form, cf_turnstile_response: 'token' })
        .expect(202)
    })
  })

  describe('POST /copyright-notices/:id/appeals', () => {
    it('rejects an unauthenticated malformed body with a bare 401', async () => {
      const response = await createRequest()
        .post(`${NOTICES}/${crypto.randomUUID()}/appeals`)
        .send({ injected: true })
        .expect(401)

      expect(response.text).not.toMatch(/schema|must be|required|invalid/i)
    })

    it('rejects a malformed path, an unknown key, and a bad body before the service runs', async () => {
      const { noticeId, targetId, poster } = await createAppealFixture()
      const key = crypto.randomUUID()
      const body = { reason: 'This is my hosted material.', target_ids: [targetId] }

      await poster
        .post(`${NOTICES}/not-a-uuid/appeals`)
        .set('Idempotency-Key', key)
        .send(body)
        .expect(422)
      await poster
        .post(`${NOTICES}/${noticeId}/appeals`)
        .set('Idempotency-Key', key)
        .send({ ...body, injected: true })
        .expect(422)
      await poster
        .post(`${NOTICES}/${noticeId}/appeals`)
        .set('Idempotency-Key', key)
        .send({ ...body, reason: 5 })
        .expect(422)
      await poster
        .post(`${NOTICES}/${noticeId}/appeals`)
        .set('Idempotency-Key', key)
        .send({ ...body, target_ids: [targetId, targetId] })
        .expect(422)

      const accepted = await poster
        .post(`${NOTICES}/${noticeId}/appeals`)
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201)
      expect(accepted.body.is_duplicate).toBe(false)
    })
  })

  describe('POST /copyright-notices/:id/counter-notices', () => {
    it('rejects an unauthenticated malformed body with a bare 401', async () => {
      const response = await createRequest()
        .post(`${NOTICES}/${crypto.randomUUID()}/counter-notices`)
        .send({ injected: true })
        .expect(401)

      expect(response.text).not.toMatch(/schema|must be|required|invalid/i)
    })

    it('rejects an unknown key before the service runs, then accepts the valid body', async () => {
      const { noticeId, targetId, poster } = await createAppealFixture()
      const key = crypto.randomUUID()

      await poster
        .post(`${NOTICES}/${noticeId}/counter-notices`)
        .set('Idempotency-Key', key)
        .send({ ...counterNoticeBody(targetId), injected: true })
        .expect(422)

      const accepted = await poster
        .post(`${NOTICES}/${noticeId}/counter-notices`)
        .set('Idempotency-Key', key)
        .send(counterNoticeBody(targetId))
        .expect(201)
      expect(accepted.body.is_duplicate).toBe(false)
    })

    it.each([
      'consent_to_federal_jurisdiction',
      'consent_to_service_of_process',
      'good_faith_misidentification_under_penalty_of_perjury',
    ])('keeps the field-named 422 for an unaccepted %s', async field => {
      const { noticeId, targetId, poster } = await createAppealFixture()

      const response = await poster
        .post(`${NOTICES}/${noticeId}/counter-notices`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ...counterNoticeBody(targetId), [field]: false })
        .expect(422)

      expect(response.body.message).toBe(`${field} must be accepted`)
    })
  })

  describe('GET routes', () => {
    it('rejects a malformed notice id with 422 after authentication', async () => {
      const request = createRequest()
      await request.authenticateAs(await createTestUser())

      await request.get(`${NOTICES}/not-a-uuid`).expect(422)
      await request.get(`${NOTICES}/not-a-uuid/participant`).expect(422)
      await createRequest().get(`${NOTICES}/not-a-uuid`).expect(401)
    })

    // The shared pagination parser owns every query rejection (400) and runs first, so the
    // generated query carrier is a drift guard: it never turns a parsed request into a 422.
    it('keeps the pagination parser statuses and serves a plain list', async () => {
      const request = createRequest()
      await request.authenticateAs(await createTestUser())

      await request.get(`${NOTICES}?after=a&after=b`).expect(400)
      await request.get(`${NOTICES}?limit=0`).expect(400)
      await request.get(`${NOTICES}?limit=1&injected=1`).expect(200)
      await createRequest().get(`${NOTICES}?limit=0`).expect(401)
    })
  })
})
