import { describe, expect, it } from 'vitest'
import {
  countPostElectionVoteRowsForUser,
  countTopicElectionVoteRowsForUser,
  createTestUser,
  insertTestPost,
  insertTestTopic,
} from '@voucha/test-helpers'
import {
  createPlatformAccountTestUser,
  makePlatformAccountTestUser,
  type PlatformAccountTestKind,
} from '@voucha/test-helpers/account-types'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { getPostElectionVote, upsertPostElectionVotes } from '../post/index.mts'
import { getTopicElectionVote, upsertTopicElectionVotes } from '../topic/index.mts'
import type { ElectionVoteScore } from './types.mts'

const KINDS: PlatformAccountTestKind[] = ['official', 'system', 'ai_agent']
const FORBIDDEN = { status: 403, code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN }

type Writer = {
  name: string
  createEntity: (creatorId: string) => Promise<string>
  upsert: (
    userId: string,
    votes: Array<{ entityId: string; score: ElectionVoteScore }>,
  ) => Promise<unknown>
  getChoice: (userId: string, entityId: string) => Promise<string | null>
  countRows: (userId: string) => Promise<number>
}

const WRITERS: Writer[] = [
  {
    name: 'topic',
    createEntity: creatorId => {
      const suffix = crypto.randomUUID().slice(0, 8)
      return insertTestTopic({
        name: `Platform vote topic ${suffix}`,
        slug: `platform-vote-topic-${suffix}`,
        createdById: creatorId,
      })
    },
    upsert: upsertTopicElectionVotes,
    getChoice: async (userId, entityId) =>
      (await getTopicElectionVote(userId, entityId))?.choice ?? null,
    countRows: countTopicElectionVoteRowsForUser,
  },
  {
    name: 'post',
    createEntity: creatorId => {
      const suffix = crypto.randomUUID().slice(0, 8)
      return insertTestPost({
        title: `Platform vote post ${suffix}`,
        slug: `platform-vote-post-${suffix}`,
        createdById: creatorId,
        markdown: 'Platform account vote test post',
      })
    },
    upsert: upsertPostElectionVotes,
    getChoice: async (userId, entityId) =>
      (await getPostElectionVote(userId, entityId))?.choice ?? null,
    countRows: countPostElectionVoteRowsForUser,
  },
]

describe.each(WRITERS)('$name election writer and platform accounts', writer => {
  it.each(KINDS)(
    'rejects every non-null score from a %s account and writes nothing',
    async kind => {
      const creator = await createTestUser()
      const entityId = await writer.createEntity(creator.id)
      const account = await createPlatformAccountTestUser(kind)

      for (const score of [1, -1, 0] as const) {
        await expect(writer.upsert(account.id, [{ entityId, score }])).rejects.toMatchObject(
          FORBIDDEN,
        )
      }

      expect(await writer.countRows(account.id)).toBe(0)
      expect(await writer.getChoice(account.id, entityId)).toBeNull()
    },
  )

  it.each(KINDS)(
    'rejects a %s batch that mixes a clear with a vote and writes neither',
    async kind => {
      const creator = await createTestUser()
      const voted = await writer.createEntity(creator.id)
      const cleared = await writer.createEntity(creator.id)
      const account = await createPlatformAccountTestUser(kind)

      await expect(
        writer.upsert(account.id, [
          { entityId: cleared, score: null },
          { entityId: voted, score: 1 },
        ]),
      ).rejects.toMatchObject(FORBIDDEN)

      expect(await writer.countRows(account.id)).toBe(0)
    },
  )

  it.each(KINDS)(
    'rejects a %s account repeating the ballot it held before promotion',
    async kind => {
      const member = await createTestUser()
      const entityId = await writer.createEntity(member.id)
      await writer.upsert(member.id, [{ entityId, score: 1 }])
      await makePlatformAccountTestUser(member.id, kind)

      await expect(writer.upsert(member.id, [{ entityId, score: 1 }])).rejects.toMatchObject(
        FORBIDDEN,
      )

      expect(await writer.getChoice(member.id, entityId)).toBe('like')
      expect(await writer.countRows(member.id)).toBe(1)
    },
  )

  it.each(KINDS)('lets a %s account clear a ballot it held before promotion', async kind => {
    const member = await createTestUser()
    const entityId = await writer.createEntity(member.id)
    await writer.upsert(member.id, [{ entityId, score: 1 }])
    await makePlatformAccountTestUser(member.id, kind)

    await expect(writer.upsert(member.id, [{ entityId, score: null }])).resolves.toHaveLength(1)

    expect(await writer.getChoice(member.id, entityId)).toBeNull()
  })

  it.each(KINDS)('accepts a %s account clear with no ballot and an empty batch', async kind => {
    const creator = await createTestUser()
    const entityId = await writer.createEntity(creator.id)
    const account = await createPlatformAccountTestUser(kind)

    await expect(writer.upsert(account.id, [{ entityId, score: null }])).resolves.toEqual([])
    await expect(writer.upsert(account.id, [])).resolves.toEqual([])

    expect(await writer.countRows(account.id)).toBe(0)
  })

  it('does not restrict members', async () => {
    const member = await createTestUser()
    const entityId = await writer.createEntity(member.id)

    await writer.upsert(member.id, [{ entityId, score: 1 }])
    expect(await writer.getChoice(member.id, entityId)).toBe('like')
    await writer.upsert(member.id, [{ entityId, score: -1 }])
    expect(await writer.getChoice(member.id, entityId)).toBe('dislike')
    await writer.upsert(member.id, [{ entityId, score: 0 }])
    expect(await writer.getChoice(member.id, entityId)).toBe('neutral')
    await writer.upsert(member.id, [{ entityId, score: null }])
    expect(await writer.getChoice(member.id, entityId)).toBeNull()
  })
})
