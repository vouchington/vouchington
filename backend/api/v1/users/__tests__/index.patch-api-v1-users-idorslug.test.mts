import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, safeUsername } from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('Users API Routes', () => {
  describe('PATCH /api/v1/users/:idOrSlug', () => {
    it('should allow a user to update their own profile', async () => {
      const username = safeUsername('users-patch-before')
      const updatedUsername = safeUsername('users-patch-after')
      const user = await createTestUser({ username })
      const request = createRequest()
      await request.authenticateAs(user!)

      const response = await request
        .patch(`/api/v1/users/${user!.id}`)
        .send({ username: updatedUsername })
        .expect(200)

      expect(response.body.user.id).toBe(user!.id)
      expect(response.body.user.username).toBe(updatedUsername)
      expect(response.body.user.is_official_account).toBe(false)
    })

    it('should allow updating topic_follows_visibility, rss_feed_follows_visibility, and community_memberships_visibility', async () => {
      const user = await createTestUser({ username: safeUsername('users-privacy-patch') })
      const request = createRequest()
      await request.authenticateAs(user!)

      const response = await request
        .patch(`/api/v1/users/${user!.id}`)
        .send({
          topic_follows_visibility: 'nobody',
          rss_feed_follows_visibility: 'followers',
          community_memberships_visibility: 'mutual_followers',
        })
        .expect(200)

      expect(response.body.user.topic_follows_visibility).toBe('nobody')
      expect(response.body.user.rss_feed_follows_visibility).toBe('followers')
      expect(response.body.user.community_memberships_visibility).toBe('mutual_followers')
    })

    it('should allow updating country and UI locale preferences', async () => {
      const user = await createTestUser({ username: safeUsername('users-locale-patch') })
      const request = createRequest()
      await request.authenticateAs(user!)

      const response = await request
        .patch(`/api/v1/users/${user!.id}`)
        .send({ country: 'us', ui_locale: 'en' })
        .expect(200)

      expect(response.body.user.country).toBe('US')
      expect(response.body.user.ui_locale).toBe('en')
    })

    it('should default fediverse_federation_enabled to false and allow opting in', async () => {
      const user = await createTestUser({ username: safeUsername('users-fediverse-patch') })
      const request = createRequest()
      await request.authenticateAs(user!)

      const before = await request.get(`/api/v1/users/${user!.id}`).expect(200)
      expect(before.body.user.fediverse_federation_enabled).toBe(false)

      const response = await request
        .patch(`/api/v1/users/${user!.id}`)
        .send({ fediverse_federation_enabled: true })
        .expect(200)

      expect(response.body.user.fediverse_federation_enabled).toBe(true)
    })

    it('should reject a non-boolean fediverse_federation_enabled value', async () => {
      const user = await createTestUser({ username: safeUsername('users-fediverse-invalid') })
      const request = createRequest()
      await request.authenticateAs(user!)

      await request
        .patch(`/api/v1/users/${user!.id}`)
        .send({ fediverse_federation_enabled: 'yes' })
        .expect(422)
    })

    it('should reject invalid topic_follows_visibility value', async () => {
      const user = await createTestUser({ username: safeUsername('users-privacy-invalid') })
      const request = createRequest()
      await request.authenticateAs(user!)

      await request
        .patch(`/api/v1/users/${user!.id}`)
        .send({ topic_follows_visibility: 'invalid-value' })
        .expect(422)
    })

    it('should reject invalid use_display_name_from values', async () => {
      const username = safeUsername('users-patch-invalid')
      const user = await createTestUser({ username })
      const request = createRequest()
      await request.authenticateAs(user!)

      await request
        .patch(`/api/v1/users/${user!.id}`)
        .send({ use_display_name_from: 'invalid-source' })
        .expect(422)
    })
  })

  describe('DELETE /api/v1/users/:idOrSlug', () => {
    it('should soft delete the authenticated user account', async () => {
      const username = safeUsername('users-delete')
      const user = await createTestUser({ username })
      const request = createRequest()
      await request.authenticateAs(user!)

      const res = await request.delete(`/api/v1/users/${user!.id}`).expect(202)
      expect(res.body.logout).toBe(true)
      await request.get(`/api/v1/users/${user!.id}`).expect(404)
    })
  })

  describe('Enumeration prevention (:idOrSlug)', () => {
    const randomEmail = () => `enum-${randomSuffix()}@example.test`

    it('DELETE rejects registered email with 422', async () => {
      const victim = await createTestUser({ username: safeUsername('enum-del-v') })
      const attacker = await createTestUser({ username: safeUsername('enum-del-a') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .delete(`/api/v1/users/${encodeURIComponent(victim!.email_address!)}`)
        .expect(422)
    })

    it('DELETE rejects unregistered email with 422', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-del-a2') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request.delete(`/api/v1/users/${encodeURIComponent(randomEmail())}`).expect(422)
    })

    it('DELETE rejects phone number with 422', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-del-p') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request.delete(`/api/v1/users/${encodeURIComponent('+15551234567')}`).expect(422)
    })

    it('PATCH rejects registered email with 422 (not 403)', async () => {
      const victim = await createTestUser({ username: safeUsername('enum-pat-v') })
      const attacker = await createTestUser({ username: safeUsername('enum-pat-a') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .patch(`/api/v1/users/${encodeURIComponent(victim!.email_address!)}`)
        .send({ username: safeUsername('changed') })
        .expect(422)
    })

    it('PATCH rejects unregistered email with 422 (not 404)', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-pat-a2') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .patch(`/api/v1/users/${encodeURIComponent(randomEmail())}`)
        .send({ username: safeUsername('changed') })
        .expect(422)
    })

    it('POST data-request rejects registered email with 422', async () => {
      const victim = await createTestUser({ username: safeUsername('enum-dr-v') })
      const attacker = await createTestUser({ username: safeUsername('enum-dr-a') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .post(`/api/v1/users/${encodeURIComponent(victim!.email_address!)}/data-request`)
        .expect(422)
    })

    it('POST data-request rejects unregistered email with 422', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-dr-a2') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .post(`/api/v1/users/${encodeURIComponent(randomEmail())}/data-request`)
        .expect(422)
    })

    it('GET data-request rejects registered email with 422', async () => {
      const victim = await createTestUser({ username: safeUsername('enum-drg-v') })
      const attacker = await createTestUser({ username: safeUsername('enum-drg-a') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .get(`/api/v1/users/${encodeURIComponent(victim!.email_address!)}/data-request`)
        .expect(422)
    })

    it('GET data-request rejects unregistered email with 422', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-drg-a2') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .get(`/api/v1/users/${encodeURIComponent(randomEmail())}/data-request`)
        .expect(422)
    })

    it('GET private collection rejects registered email with 422', async () => {
      const victim = await createTestUser({ username: safeUsername('enum-col-v') })
      const attacker = await createTestUser({ username: safeUsername('enum-col-a') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .get(`/api/v1/users/${encodeURIComponent(victim!.email_address!)}/users/blocked`)
        .expect(422)
    })

    it('PATCH rejects phone number with 422', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-pat-p') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .patch(`/api/v1/users/${encodeURIComponent('+15551234567')}`)
        .send({ username: safeUsername('changed') })
        .expect(422)
    })

    it('POST data-request rejects phone number with 422', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-dr-p') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .post(`/api/v1/users/${encodeURIComponent('+15551234567')}/data-request`)
        .expect(422)
    })

    it('GET data-request rejects phone number with 422', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-drg-p') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .get(`/api/v1/users/${encodeURIComponent('+15551234567')}/data-request`)
        .expect(422)
    })

    it('GET private collection rejects phone number with 422', async () => {
      const attacker = await createTestUser({ username: safeUsername('enum-col-p') })
      const request = createRequest()
      await request.authenticateAs(attacker!)
      await request
        .get(`/api/v1/users/${encodeURIComponent('+15551234567')}/users/blocked`)
        .expect(422)
    })
  })
})
