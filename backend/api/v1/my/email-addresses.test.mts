import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'
import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, updateTestUserUiLocale } from '@voucha/test-helpers'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'

const newAddress = () => `tests+test-${Math.random().toString(36).slice(2, 10)}@voucha.ai`

describe('email address list and verification request', () => {
  installEmailDomainDnsMock()

  it('returns an empty page with null cursors after the last address', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const first = await request.get('/api/v1/my/email-addresses?limit=1').expect(200)
    expect(first.body.results).toHaveLength(1)
    const cursor = first.body.page_info.start_cursor as string

    const next = await request
      .get('/api/v1/my/email-addresses')
      .query({ after: cursor })
      .expect(200)
    expect(next.body.results).toEqual([])
    expect(next.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('requests verification for a user without a UI locale', async () => {
    const user = await createTestUser()
    await updateTestUserUiLocale(user.id, null)
    const address = newAddress()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({
        email_address: address,
        re_auth_token: await createTestAccountChangeProof(user.id, request),
      })
      .expect(200)
    expect(response.body.email_address).toBe(address)
  })

  it('keeps the existing-address error for the current user', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({
        email_address: user.email_address,
        re_auth_token: await createTestAccountChangeProof(user.id, request),
      })
      .expect(422)

    expect(response.body.message).toBe('Email address already added to your account')
  })

  it('keeps the in-use error for another user address', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/email-addresses')
      .send({
        email_address: otherUser.email_address,
        re_auth_token: await createTestAccountChangeProof(user.id, request),
      })
      .expect(422)

    expect(response.body.message).toBe('Email address is already in use')
  })

  it('checks email availability with one annotated query', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubEnv('VITEST_DIAGNOSTICS', '1')

    try {
      const user = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .post('/api/v1/my/email-addresses')
        .send({
          email_address: newAddress(),
          re_auth_token: await createTestAccountChangeProof(user.id, request),
        })
        .expect(200)

      const profileLines = stderr.mock.calls
        .map(([chunk]) => String(chunk))
        .filter(line => line.includes('route=POST /api/v1/my/email-addresses '))
      expect(profileLines).toHaveLength(1)
      expect(profileLines[0]).not.toContain('assertEmailAddressAvailableForUser')
    } finally {
      stderr.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
