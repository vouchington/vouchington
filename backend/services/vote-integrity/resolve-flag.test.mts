import { describe, it, expect, beforeAll } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { randomBytes } from 'node:crypto'
import {
  createTestTopic,
  createTestUser,
  createTestUserDirect,
  createTestAgent,
  getEntityRelation,
  insertEntityRelation,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
} from '@voucha/test-helpers'
import { createVoteIntegrityFlag } from './create-flag.mts'
import { getVoteIntegrityFlagByIdFromPrimary } from './get-flags.mts'
import { resolveVoteIntegrityFlag } from './resolve-flag.mts'
import type { PrivateUser } from '@services/users/types'

describe('resolve-flag', () => {
  const randomUsername = () => `test-vi-rf-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-rf-${randomBytes(6).toString('hex')}`

  let adminUser: PrivateUser
  let creatorUser: PrivateUser

  beforeAll(async () => {
    ;[adminUser, creatorUser] = await Promise.all([
      createTestUser({ administrator: true, username: randomUsername() }) as Promise<PrivateUser>,
      createTestUserDirect({ username: randomUsername() }) as Promise<PrivateUser>,
    ])
  }, 60_000)

  function makePost(slug: string): Promise<string> {
    return insertTestPost({
      title: `RF Test ${slug}`,
      slug,
      createdById: creatorUser.id,
      markdown: 'test',
    })
  }

  describe('resolveVoteIntegrityFlag', () => {
    it('sets resolved_at, resolved_by_id, and resolution on the flag', async () => {
      const postId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', postId, 'velocity_spike', {
        test: true,
      })
      expect(flag).not.toBeNull()

      const resolved = await resolveVoteIntegrityFlag(flag!.id, adminUser.id, 'dismissed')
      expect(resolved.resolved_at).not.toBeNull()
      expect(resolved.resolved_by_id).toBe(adminUser.id)
      expect(resolved.resolution).toBe('dismissed')
    }, 60_000)

    it('throws 404 when trying to resolve an already-resolved flag', async () => {
      const postId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', postId, 'ip_correlation', {})
      expect(flag).not.toBeNull()

      await resolveVoteIntegrityFlag(flag!.id, adminUser.id, 'dismissed')

      // Attempting to resolve again should throw
      await expect(resolveVoteIntegrityFlag(flag!.id, adminUser.id, 'penalized')).rejects.toThrow(
        Error,
      )
    }, 60_000)

    it('throws 404 for unknown flag ID', async () => {
      const fakeId = uuidv7()
      await expect(resolveVoteIntegrityFlag(fakeId, adminUser.id, 'dismissed')).rejects.toThrow(
        Error,
      )
    }, 60_000)

    it('createVoteIntegrityFlag deduplicates unresolved flags for same entity+type', async () => {
      const postId = await makePost(randomSlug())
      const flag1 = await createVoteIntegrityFlag('post', postId, 'velocity_spike', {
        attempt: 1,
      })
      const flag2 = await createVoteIntegrityFlag('post', postId, 'velocity_spike', {
        attempt: 2,
      })
      expect(flag1).not.toBeNull()
      expect(flag2).toBeNull() // second insert is deduplicated
    }, 60_000)

    it('creates a flag through a concrete relation target and preserves the response field', async () => {
      const topic = await createTestTopic({ user: creatorUser })
      const postId = await makePost(randomSlug())
      const table = 'relation__topic__related__post'
      await insertEntityRelation(table, topic.id, postId)
      const [relation] = (await getEntityRelation(table, topic.id, postId)) as Array<{ id: string }>

      const flag = await createVoteIntegrityFlag(
        'entity_relation',
        relation.id!,
        'velocity_spike',
        {},
      )

      expect(flag?.entity_relation_id).toBe(relation.id)
      await expect(getVoteIntegrityFlagByIdFromPrimary(flag!.id)).resolves.toMatchObject({
        id: flag!.id,
        entity_relation_id: relation.id,
      })
    }, 60_000)

    it('creates and deduplicates flags for an agent moderation', async () => {
      const postId = await makePost(randomSlug())
      const agent = await createTestAgent()
      const promptId = await insertTestAgentPrompt({ agentId: agent.id })
      const moderationId = await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
      })

      const flag = await createVoteIntegrityFlag(
        'agent_moderation',
        moderationId,
        'velocity_spike',
        { source: 'test' },
      )
      const duplicate = await createVoteIntegrityFlag(
        'agent_moderation',
        moderationId,
        'velocity_spike',
        { source: 'duplicate' },
      )

      expect(flag).toMatchObject({
        post_id: null,
        agent_moderation_id: moderationId,
        details: { source: 'test' },
      })
      expect(duplicate).toBeNull()
    }, 60_000)
  })
})
