import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'

describe('PUT /api/v1/bookmarks/user/:id/follow response privacy', () => {
  it('does not expose the internal ActivityPub Follow identity', async () => {
    const follower = await createTestUser()
    const followee = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(follower)

    const response = await request.put(`/api/v1/bookmarks/user/${followee.id}/follow`).expect(200)

    expect(response.body.bookmark).toBeDefined()
    expect(response.body.bookmark).not.toHaveProperty('outbound_ap_follow_activity_id')
  })
})
