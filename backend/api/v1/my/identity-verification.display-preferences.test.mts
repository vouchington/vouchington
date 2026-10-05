import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, setUserVerificationFields } from '@voucha/test-helpers'
import { getPrivateUserByAny } from '@services/users/get'

const path = '/api/v1/my/identity-verification/display-preferences'

describe('PATCH /api/v1/my/identity-verification/display-preferences', () => {
  it('updates the display preferences of a verified user', async () => {
    const user = await createTestUser()
    await setUserVerificationFields(user.id, { verificationStatus: 'verified' })
    const request = createRequest()
    await request.authenticateAs((await getPrivateUserByAny(user.id))!)

    const response = await request
      .patch(path)
      .send({ is_verified_badge_visible: false, public_verified_name_display: 'first_name' })
      .expect(200)
    expect(response.body.is_verified_badge_visible).toBe(false)
    expect(response.body.public_verified_name_display).toBe('first_name')
  })

  it('rejects a user who is not identity verified', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser())
    await request.patch(path).send({ is_verified_badge_visible: false }).expect(422)
  })
})
