import { describe, expect, it } from 'vitest'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import type { PrivateUser } from '@services/users/types'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

import { communityModerationOutput } from './community-moderation-contract.mts'

const WRITE_SCOPES = ['community-moderation:read', 'community-moderation:write'] as const

async function noteFixture() {
  const owner = await createTestPlusMcpCaller()
  const moderator = await createTestPlusMcpCaller()
  const otherModerator = await createTestPlusMcpCaller()
  const target = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id })
  const otherCommunity = await insertTestCommunity({ createdById: owner.id })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
    insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    }),
    insertTestCommunityMember({
      communityId: otherCommunity.id,
      userId: otherModerator.id,
      role: 'moderator',
    }),
  ])
  return { moderator, otherModerator, target, community, otherCommunity }
}

async function readNotes(caller: PrivateUser, userId: string) {
  const request = createRequest()
  await request.authenticateAs(caller)
  return request.get(`/api/v1/users/${userId}/mod-notes`).expect(200)
}

describe('community moderation MCP moderator-note options — REST twins and real PostgreSQL', () => {
  it('creates through MCP, reads the persisted REST representation, and deletes through MCP', async () => {
    const { moderator, target, community } = await noteFixture()
    const body = `MCP-created note ${crypto.randomUUID()}`
    const created = await callStructuredMcpTool(
      moderator,
      'add_community_moderation',
      optionArgs('create_mod_note', {
        userId: target.id,
        body,
        community_id: community.id,
      }),
      WRITE_SCOPES,
    )
    expect(created.note).toEqual(expect.stringContaining('<external-content'))
    const list = await readNotes(moderator, target.id)
    const note = list.body.notes.find((row: { body: string }) => row.body === body) as {
      id: string
    }
    expect(note).toBeDefined()
    expect(created).toEqual(await communityModerationOutput({ note }))
    expect(list.body.notes).toContainEqual(
      expect.objectContaining({
        id: note.id,
        author_user_id: moderator.id,
        community_id: community.id,
        target_user_id: target.id,
        body,
        deleted_at: null,
      }),
    )

    expect(
      await callStructuredMcpTool(
        moderator,
        'remove_community_moderation',
        optionArgs('delete_mod_note', { userId: target.id, noteId: note.id }),
        WRITE_SCOPES,
      ),
    ).toEqual({ ok: true })
    expect((await readNotes(moderator, target.id)).body.notes).not.toContainEqual(
      expect.objectContaining({ id: note.id }),
    )
  })

  it('deletes a REST-created note through MCP and rejects notes outside the moderator community', async () => {
    const { moderator, otherModerator, target, community, otherCommunity } = await noteFixture()
    const restBody = `REST-created note ${crypto.randomUUID()}`
    const rest = createRequest()
    await rest.authenticateAs(moderator)
    const response = await rest
      .post(`/api/v1/users/${target.id}/mod-notes`)
      .send({ body: restBody, community_id: community.id })
      .set('Content-Type', 'application/json')
      .expect(201)
    const restNoteId = response.body.note.id as string

    const otherRest = createRequest()
    await otherRest.authenticateAs(otherModerator)
    await otherRest.delete(`/api/v1/users/${target.id}/mod-notes/${restNoteId}`).expect(403)
    expect(
      await callRejectedMcpTool(
        otherModerator,
        'remove_community_moderation',
        optionArgs('delete_mod_note', { userId: target.id, noteId: restNoteId }),
        WRITE_SCOPES,
      ),
    ).toContain('Forbidden')
    expect((await readNotes(moderator, target.id)).body.notes).toContainEqual(
      expect.objectContaining({ id: restNoteId, body: restBody, deleted_at: null }),
    )

    expect(
      await callRejectedMcpTool(
        moderator,
        'add_community_moderation',
        optionArgs('create_mod_note', {
          userId: target.id,
          body: `Wrong community ${crypto.randomUUID()}`,
          community_id: otherCommunity.id,
        }),
        WRITE_SCOPES,
      ),
    ).toContain('do not moderate this community')
    expect(
      await callRejectedMcpTool(
        moderator,
        'add_community_moderation',
        optionArgs('create_mod_note', {
          userId: target.id,
          body: `Global note ${crypto.randomUUID()}`,
        }),
        WRITE_SCOPES,
      ),
    ).toContain('Only site staff can create global moderator notes')

    await rest.delete(`/api/v1/users/${target.id}/mod-notes/${restNoteId}`).expect(200)
    expect((await readNotes(moderator, target.id)).body.notes).not.toContainEqual(
      expect.objectContaining({ id: restNoteId }),
    )
  })
  it('admits staff global notes and rejects suspended or non-moderating callers like REST', async () => {
    const staff = await createTestPlusMcpCaller({ administrator: true })
    const target = await createTestPlusMcpCaller()
    const body = `Global note ${crypto.randomUUID()}`
    const args = optionArgs('create_mod_note', { userId: target.id, body })
    const ordinaryRest = createRequest()
    await ordinaryRest.authenticateAs(target)
    await ordinaryRest.post(`/api/v1/users/${target.id}/mod-notes`).send({ body }).expect(403)
    expect(
      await callRejectedMcpTool(target, 'add_community_moderation', args, WRITE_SCOPES),
    ).toContain('Forbidden')
    const created = await callStructuredMcpTool(
      staff,
      'add_community_moderation',
      args,
      WRITE_SCOPES,
    )
    const list = await readNotes(staff, target.id)
    const note = list.body.notes.find((row: { body: string }) => row.body === body) as {
      id: string
    }
    expect(note).toMatchObject({ community_id: null, author_user_id: staff.id })
    expect(created).toEqual(await communityModerationOutput({ note }))
    const remove = optionArgs('delete_mod_note', { userId: target.id, noteId: note.id })
    await suspendTestUser(staff.id)
    try {
      const rest = createRequest()
      await rest.authenticateAs(staff)
      await rest.post(`/api/v1/users/${target.id}/mod-notes`).send({ body }).expect(403)
      await rest.delete(`/api/v1/users/${target.id}/mod-notes/${note.id}`).expect(403)
      expect(
        await callRejectedMcpTool(staff, 'add_community_moderation', args, WRITE_SCOPES),
      ).toContain('suspended')
      expect(
        await callRejectedMcpTool(staff, 'remove_community_moderation', remove, WRITE_SCOPES),
      ).toContain('suspended')
    } finally {
      await unsuspendTestUser(staff.id)
    }
    const rest = createRequest()
    await rest.authenticateAs(staff)
    await rest.delete(`/api/v1/users/${target.id}/mod-notes/${note.id}`).expect(200)
    expect((await readNotes(staff, target.id)).body.notes).toEqual([])
  })
})
