import { describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  archiveTestCommunity,
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

describe('community archive route', () => {
  it('updates list and roster visibility settings while leaving archive unchanged', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-settings-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ list_type: 'follow', member_roster_visibility: 'members' })
      .expect(200)

    expect(response.body.community.list_type).toBe('follow')
    expect(response.body.community.member_roster_visibility).toBe('members')
    expect(response.body.community.archived_at).toBeNull()
  })

  it('archives a community as owner', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-archive-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ archive: true })
      .expect(200)

    expect(response.body.community.archived_at).not.toBeNull()
    expect(response.body.community.archived_by_id).toBe(patchUser.id)
  })

  it('updates settings and archives in one request', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-update-archive-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ list_type: 'follow', archive: true })
      .expect(200)

    expect(response.body.community.list_type).toBe('follow')
    expect(response.body.community.archived_at).not.toBeNull()
    expect(response.body.community.archived_by_id).toBe(patchUser.id)
  })

  it('unarchives a community as owner', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-unarchive-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: patchUser.id })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ archive: false })
      .expect(200)

    expect(response.body.community.archived_at).toBeNull()
    expect(response.body.community.archived_by_id).toBeNull()
  })

  it('rejects settings updates while archived', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-archived-readonly-${random}`,
      name: `Archived Community ${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: patchUser.id })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ name: `Updated ${random}` })
      .expect(409)

    expect(response.body.message).toContain('Archived communities cannot be updated')
  })

  it('returns a precise message when archiving an already archived community', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-already-archived-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: patchUser.id })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ archive: true })
      .expect(409)

    expect(response.body.message).toBe('Community is already archived')
  })

  it('returns 422 for non-boolean archive values', async () => {
    const patchUser = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: patchUser.id,
      slug: `community-patch-archive-invalid-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: patchUser.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(patchUser)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}`)
      .set('Content-Type', 'application/json')
      .send({ archive: 'yes' })
      .expect(422)

    expect(response.body.message).toContain('archive must be a boolean')
  })
})
