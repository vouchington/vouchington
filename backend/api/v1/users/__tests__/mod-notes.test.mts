import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  safeUsername,
} from '@voucha/test-helpers'

describe('GET /api/v1/users/:userId/mod-notes', () => {
  it('returns 401 for unauthenticated', async () => {
    const target = await createTestUser({ username: safeUsername('mn-anon-get') })
    const request = createRequest()
    await request.get(`/api/v1/users/${target.id}/mod-notes`).expect(401)
  })

  it('returns 403 for regular non-mod user', async () => {
    const user = await createTestUser({ username: safeUsername('mn-nomod-get') })
    const target = await createTestUser({ username: safeUsername('mn-nomod-tgt') })
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get(`/api/v1/users/${target.id}/mod-notes`).expect(403)
  })

  it('returns notes as site admin (all notes visible)', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-admin-tgt') })
    const community = await insertTestCommunity({ createdById: admin.id })
    await insertTestCommunityMember({ communityId: community.id, userId: admin.id, role: 'owner' })

    const request = createRequest()
    await request.authenticateAs(admin)

    // Create a global note
    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Global note' })
      .set('Content-Type', 'application/json')
      .expect(201)

    // Create a community note
    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Community note', community_id: community.id })
      .set('Content-Type', 'application/json')
      .expect(201)

    const response = await request.get(`/api/v1/users/${target.id}/mod-notes`).expect(200)
    expect(response.body.notes.length).toBe(2)
  })

  it('community mod sees only their community notes (not global, not other communities)', async () => {
    const admin = await createTestUser({ administrator: true })
    const mod = await createTestUser({ username: safeUsername('mn-cmod') })
    const target = await createTestUser({ username: safeUsername('mn-cmod-tgt') })
    const community = await insertTestCommunity({ createdById: admin.id })
    const otherCommunity = await insertTestCommunity({ createdById: admin.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: mod.id,
      role: 'moderator',
    })

    const adminRequest = createRequest()
    await adminRequest.authenticateAs(admin)

    // Global note (only staff should see)
    await adminRequest
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Global note' })
      .set('Content-Type', 'application/json')
      .expect(201)

    // Note in mod's community
    await adminRequest
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Community note', community_id: community.id })
      .set('Content-Type', 'application/json')
      .expect(201)

    // Note in other community
    await adminRequest
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Other community note', community_id: otherCommunity.id })
      .set('Content-Type', 'application/json')
      .expect(201)

    const modRequest = createRequest()
    await modRequest.authenticateAs(mod)
    const response = await modRequest.get(`/api/v1/users/${target.id}/mod-notes`).expect(200)

    // Should only see the note from their community
    expect(response.body.notes.length).toBe(1)
    expect(response.body.notes[0].community_id).toBe(community.id)
    expect(response.body.notes[0].body).toBe('Community note')
  })
})

describe('POST /api/v1/users/:userId/mod-notes', () => {
  it('returns 401 for unauthenticated', async () => {
    const target = await createTestUser({ username: safeUsername('mn-anon-post') })
    const request = createRequest()
    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Some note' })
      .set('Content-Type', 'application/json')
      .expect(401)
  })

  it('returns 403 for regular non-mod user', async () => {
    const user = await createTestUser({ username: safeUsername('mn-nomod-post') })
    const target = await createTestUser({ username: safeUsername('mn-nomod-posttgt') })
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Some note' })
      .set('Content-Type', 'application/json')
      .expect(403)
  })

  it('creates global note as site admin → 201', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-admin-tgt2') })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Admin global note' })
      .set('Content-Type', 'application/json')
      .expect(201)

    expect(response.body.note.target_user_id).toBe(target.id)
    expect(response.body.note.author_user_id).toBe(admin.id)
    expect(response.body.note.community_id).toBeNull()
    expect(response.body.note.body).toBe('Admin global note')
  })

  it('creates community-scoped note as community moderator → 201', async () => {
    const owner = await createTestUser({ username: safeUsername('mn-owner') })
    const mod = await createTestUser({ username: safeUsername('mn-cmod2') })
    const target = await createTestUser({ username: safeUsername('mn-cmod2-tgt') })
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: mod.id,
      role: 'moderator',
    })

    const request = createRequest()
    await request.authenticateAs(mod)

    const response = await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Community mod note', community_id: community.id })
      .set('Content-Type', 'application/json')
      .expect(201)

    expect(response.body.note.community_id).toBe(community.id)
    expect(response.body.note.body).toBe('Community mod note')
  })

  it('returns 403 when community mod tries to create global note (community_id = null)', async () => {
    const owner = await createTestUser({ username: safeUsername('mn-cmod3-owner') })
    const mod = await createTestUser({ username: safeUsername('mn-cmod3') })
    const target = await createTestUser({ username: safeUsername('mn-cmod3-tgt') })
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: mod.id,
      role: 'moderator',
    })

    const request = createRequest()
    await request.authenticateAs(mod)

    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Sneaky global note' })
      .set('Content-Type', 'application/json')
      .expect(403)
  })

  it('returns 403 when community mod tries to create note for a community they do not moderate', async () => {
    const owner = await createTestUser({ username: safeUsername('mn-cmod4-owner') })
    const mod = await createTestUser({ username: safeUsername('mn-cmod4') })
    const target = await createTestUser({ username: safeUsername('mn-cmod4-tgt') })
    const community = await insertTestCommunity({ createdById: owner.id })
    const otherCommunity = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: mod.id,
      role: 'moderator',
    })

    const request = createRequest()
    await request.authenticateAs(mod)

    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Wrong community note', community_id: otherCommunity.id })
      .set('Content-Type', 'application/json')
      .expect(403)
  })

  it('returns 422 for missing body', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-422-nobody') })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({})
      .set('Content-Type', 'application/json')
      .expect(422)
  })

  it('returns 422 for body > 2000 chars', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-422-long') })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'x'.repeat(2001) })
      .set('Content-Type', 'application/json')
      .expect(422)
  })

  it('returns 422 for invalid communityId UUID', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-422-baduuid') })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Some note', community_id: 'not-a-uuid' })
      .set('Content-Type', 'application/json')
      .expect(422)
  })
})

describe('DELETE /api/v1/users/:userId/mod-notes/:noteId', () => {
  it('staff can delete their own note', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-del-author-tgt') })
    const request = createRequest()
    await request.authenticateAs(admin)

    const createResponse = await request
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Note to delete' })
      .set('Content-Type', 'application/json')
      .expect(201)

    const noteId = createResponse.body.note.id
    await request.delete(`/api/v1/users/${target.id}/mod-notes/${noteId}`).expect(200)
  })

  it('site admin can delete another user note', async () => {
    const [admin, otherAdmin] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ administrator: true }),
    ])
    const target = await createTestUser({ username: safeUsername('mn-del-admin-tgt') })
    const authorReq = createRequest()
    await authorReq.authenticateAs(otherAdmin!)
    const { body: created } = await authorReq
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Admin note to delete' })
      .set('Content-Type', 'application/json')
      .expect(201)
    const adminReq = createRequest()
    await adminReq.authenticateAs(admin!)
    await adminReq.delete(`/api/v1/users/${target.id}/mod-notes/${created.note.id}`).expect(200)
  })

  it('returns 403 when unrelated user tries to delete', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('mn-del-403-tgt') })
    const unrelated = await createTestUser({ username: safeUsername('mn-del-403-usr') })
    const adminReq = createRequest()
    await adminReq.authenticateAs(admin)
    const { body } = await adminReq
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: 'Note by admin' })
      .set('Content-Type', 'application/json')
      .expect(201)
    const unrelatedReq = createRequest()
    await unrelatedReq.authenticateAs(unrelated)
    await unrelatedReq.delete(`/api/v1/users/${target.id}/mod-notes/${body.note.id}`).expect(403)
  })
})
