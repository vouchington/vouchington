import { beforeAll, describe, expect, it } from 'vitest'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import { createRequest } from '@voucha/test-helpers/api/server'
import { addVerifiedEmailForUser, createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createEmailVerificationToken } from '@services/my/email-address-verification'
import { createTestAccountChangeProof } from '@voucha/test-helpers/account-change'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)
const TEST_EMAIL_BASE = 'tests+my-identity'

describe('PATCH /api/v1/my/email-addresses/:email (set primary)', () => {
  installEmailDomainDnsMock()

  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('sets an email as primary', async () => {
    const suffix = randomSuffix()
    const secondEmail = `${TEST_EMAIL_BASE}-primary-${suffix}@voucha.ai`

    const { token } = await createEmailVerificationToken(user.id, secondEmail)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post(`/api/v1/my/email-addresses/${encodeURIComponent(secondEmail)}/verifications`)
      .send({ token, re_auth_token: await createTestAccountChangeProof(user.id, request) })
      .expect(200)

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        addVerifiedEmailForUser(user.id, `${TEST_EMAIL_BASE}-bounded-${index}-${suffix}@voucha.ai`),
      ),
    )

    const response = await request
      .patch(`/api/v1/my/email-addresses/${encodeURIComponent(secondEmail)}`)
      .send({
        is_primary: true,
        re_auth_token: await createTestAccountChangeProof(user.id, request),
      })
      .expect(200)

    const primary = response.body.results.find(
      (e: { email_address: string; is_primary: boolean }) => e.is_primary,
    )
    expect(primary?.email_address).toBe(secondEmail)
    expect(response.body.results).toHaveLength(10)
    expect(response.body.results[0].email_address).toBe(secondEmail)
    expect(response.body.page_info.has_next_page).toBe(false)
    expect(response.body.page_info.end_cursor).toBeNull()

    const firstPage = await request
      .get('/api/v1/my/email-addresses')
      .query({ limit: 1 })
      .expect(200)
    expect(firstPage.body.results).toHaveLength(1)
    expect(firstPage.body.results[0].email_address).toBe(secondEmail)
    expect(firstPage.body.page_info.has_next_page).toBe(true)
    const secondPage = await request
      .get('/api/v1/my/email-addresses')
      .query({ limit: 9, after: firstPage.body.page_info.end_cursor })
      .expect(200)
    expect(secondPage.body.results).toHaveLength(9)
    expect(
      secondPage.body.results.every((email: { is_primary: boolean }) => !email.is_primary),
    ).toBe(true)
    expect(secondPage.body.page_info.has_next_page).toBe(false)
    expect(
      new Set(
        [...firstPage.body.results, ...secondPage.body.results].map(
          (email: { email_address: string }) => email.email_address,
        ),
      ).size,
    ).toBe(10)
  })
})
