import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { TEST_CAPTCHA_TOKEN } from '@voucha/test-helpers/captcha/test-captcha-token'
import { createTestUser, insertTestPost, softDeleteUser } from '@voucha/test-helpers'
import { removeTestUserRole } from '@voucha/test-helpers/entities/user-role-removal'
import { upsertTestHostnameId } from '@voucha/test-helpers/entities/email-domain-hostname'
import { Response as UndiciResponse } from 'undici'
import type { PrivateUser } from '@services/users/types'
import type * as Undici from 'undici'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

describe('POST /api/v1/reports CAPTCHA', () => {
  let postOwner: PrivateUser
  let reporter: PrivateUser
  let postId: string

  beforeAll(async () => {
    postOwner = await createTestUser()
    reporter = await createTestUser()
    postId = await insertTestPost({
      createdById: postOwner.id,
      slug: `report-captcha-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Captcha Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Test body',
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SKIP_CAPTCHA_VERIFICATION', 'false')
    mockFetch.mockResolvedValue(new UndiciResponse(JSON.stringify({ success: true })))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 422 when the Turnstile token is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(reporter)

    const response = await request
      .post('/api/v1/reports')
      .send({ entityType: 'post', entityId: postId, reason: 'spam' })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
  })

  it('returns 422 (not 500) when the JSON body is null', async () => {
    const request = createRequest()
    await request.authenticateAs(reporter)

    await request
      .post('/api/v1/reports')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)
  })

  it.each([
    ['post', 'deleted'],
    ['post', 'demoted'],
    ['url_hostname', 'deleted'],
    ['url_hostname', 'demoted'],
  ] as const)(
    'rechecks the %s report actor after being %s during CAPTCHA',
    async (entityType, state) => {
      const administrator = await createTestUser({ administrator: true })
      const entityId =
        entityType === 'post'
          ? await insertTestPost({
              createdById: postOwner.id,
              title: 'Private report target',
              slug: `private-report-${crypto.randomUUID()}`,
              markdown: 'Private report target.',
              privacy: 'private',
              broadcast: 'followers',
              clearanceStatus: 'pending',
            })
          : await upsertTestHostnameId(
              `private-report-${crypto.randomUUID()}.example.test`,
              {},
              'private_email',
            )
      const request = createRequest()
      await request.authenticateAs(administrator)
      mockFetch.mockImplementationOnce(async () => {
        if (state === 'deleted') await softDeleteUser(administrator.id)
        else await removeTestUserRole(administrator.id, 'administrator')
        return new UndiciResponse(JSON.stringify({ success: true }))
      })
      const response = await request
        .post('/api/v1/reports')
        .send({ entityType, entityId, reason: 'spam', cf_turnstile_response: TEST_CAPTCHA_TOKEN })
        .expect(404)
      expect(response.body.message).toBe('Reportable entity not found')
    },
  )

  it('submits the report and forwards the token when verification passes', async () => {
    const request = createRequest()
    await request.authenticateAs(reporter)

    const response = await request
      .post('/api/v1/reports')
      .send({
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(res => {
        expect([200, 201]).toContain(res.status)
      })

    expect(response.body.report).toHaveProperty('id')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        body: expect.stringContaining(`response=${TEST_CAPTCHA_TOKEN}`),
      }),
    )
  })
})
