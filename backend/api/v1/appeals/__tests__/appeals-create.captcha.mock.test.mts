import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestCommunity, insertTestCommunityBan } from '@voucha/test-helpers'
import { Response as UndiciResponse } from 'undici'
import type { PrivateUser } from '@services/users/types'
import type * as Undici from 'undici'

const mockFetch = vi.hoisted(() => vi.fn<typeof Undici.fetch>())

vi.mock<typeof import('undici')>(import('undici'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, fetch: mockFetch }
})

const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

describe('POST /api/v1/appeals CAPTCHA', () => {
  let staff: PrivateUser
  let appellant: PrivateUser
  let banId: string

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    appellant = await createTestUser()
    const community = await insertTestCommunity({
      name: `Appeal Captcha Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `appeal-captcha-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Violations',
    })
    banId = ban.id
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
    await request.authenticateAs(appellant)

    const response = await request
      .post('/api/v1/appeals')
      .send({ target_type: 'ban', target_id: banId, appeal_reason: 'unfair' })
      .expect(422)

    expect(response.body.message).toContain('CAPTCHA token is required')
  })

  it('creates the appeal and forwards the token when verification passes', async () => {
    const community = await insertTestCommunity({
      name: `Appeal Captcha New Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `appeal-captcha-new-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Violations',
    })

    const request = createRequest()
    await request.authenticateAs(appellant)

    const response = await request
      .post('/api/v1/appeals')
      .send({
        target_type: 'ban',
        target_id: ban.id,
        appeal_reason: `I understand the rules now ${crypto.randomUUID()}`,
        cf_turnstile_response: TEST_CAPTCHA_TOKEN,
      })
      .expect(res => {
        expect([200, 201]).toContain(res.status)
      })

    expect(response.body.appeal.community_ban_id).toBe(ban.id)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        body: expect.stringContaining(`response=${TEST_CAPTCHA_TOKEN}`),
      }),
    )
  })
})
