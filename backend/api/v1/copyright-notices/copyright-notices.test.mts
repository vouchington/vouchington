import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'

describe('copyright notice routes', () => {
  beforeEach(() => {
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'true')
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.stubEnv('SES_COPYRIGHT_SOURCE_EMAIL', 'copyright@voucha.ai')
    vi.stubEnv('SES_COPYRIGHT_REPLY_TO', 'copyright@voucha.ai')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a form intake without CAPTCHA verification', async () => {
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')

    const response = await createRequest().post('/api/v1/copyright-notices').send({}).expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
  })

  it('accepts an authenticated structured form exactly once for an idempotency key', async () => {
    const fixture = await createCopyrightFormFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.claimant)
    const idempotencyKey = crypto.randomUUID()

    const first = await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', idempotencyKey)
      .send(fixture.form)
      .expect(202)
    const replay = await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', idempotencyKey)
      .send(fixture.form)
      .expect(200)

    expect(first.body).toEqual({
      copyright_notice: { id: expect.any(String) },
      is_duplicate: false,
    })
    expect(replay.body).toEqual({
      copyright_notice: { id: first.body.copyright_notice.id },
      is_duplicate: true,
    })
  })

  it('rejects anonymous appeals and counter-notices', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createNotice(fixture)

    await createRequest().post(`/api/v1/copyright-notices/${noticeId}/appeals`).send({}).expect(401)
    await createRequest()
      .post(`/api/v1/copyright-notices/${noticeId}/counter-notices`)
      .send({})
      .expect(401)
  })

  it('only lets the affected poster submit an appeal or counter-notice', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createNotice(fixture)
    const targetId = await readCopyrightNoticeTargetId(noticeId)
    const otherUser = await createTestUser()
    const otherRequest = createRequest()
    await otherRequest.authenticateAs(otherUser)

    await otherRequest
      .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'This does not belong to me.', target_ids: [targetId] })
      .expect(403)
    await otherRequest
      .post(`/api/v1/copyright-notices/${noticeId}/counter-notices`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(counterNoticeBody(targetId))
      .expect(403)

    const posterRequest = createRequest()
    await posterRequest.authenticateAs(fixture.poster)
    const appealKey = crypto.randomUUID()
    const appeal = await posterRequest
      .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
      .set('Idempotency-Key', appealKey)
      .send({ reason: 'This is my hosted material.', target_ids: [targetId] })
      .expect(201)
    const replay = await posterRequest
      .post(`/api/v1/copyright-notices/${noticeId}/appeals`)
      .set('Idempotency-Key', appealKey)
      .send({ reason: 'This is my hosted material.', target_ids: [targetId] })
      .expect(200)

    expect(replay.body).toEqual({
      copyright_submission: { id: appeal.body.copyright_submission.id },
      is_duplicate: true,
    })
  })
})

async function createCopyrightFormFixture() {
  const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
  const postId = await insertTestPost({
    title: `Copyright route test ${crypto.randomUUID()}`,
    slug: `copyright-route-test-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'Hosted image for a copyright-notice route test.',
  })
  const imageId = await insertTestImage(poster.id)
  await insertTestPostImage({ postId, imageId })
  return {
    claimant,
    poster,
    form: {
      jurisdiction: 'us_dmca',
      claimant_display_name: 'Copyright claimant',
      claimant_contact: 'claimant@example.test',
      claimant_email: 'claimant@example.test',
      work_description: 'A photograph owned by the claimant.',
      good_faith_belief: true,
      accuracy_authority_under_penalty_of_perjury: true,
      electronic_signature: 'Copyright claimant',
      targets: [
        {
          post_id: postId,
          image_id: imageId,
          target_url: `https://voucha.ai/posts/${postId}`,
        },
      ],
    },
  }
}

async function createNotice(fixture: Awaited<ReturnType<typeof createCopyrightFormFixture>>) {
  const request = createRequest()
  await request.authenticateAs(fixture.claimant)
  const response = await request
    .post('/api/v1/copyright-notices')
    .set('Idempotency-Key', crypto.randomUUID())
    .send(fixture.form)
    .expect(202)
  return response.body.copyright_notice.id as string
}

function counterNoticeBody(targetId: string): Record<string, unknown> {
  return {
    name: 'Hosted-material poster',
    address: '1 Main Street, Example City',
    telephone: '555-0100',
    consent_to_federal_jurisdiction: true,
    consent_to_service_of_process: true,
    good_faith_misidentification_under_penalty_of_perjury: true,
    electronic_signature: 'Hosted-material poster',
    target_ids: [targetId],
  }
}
