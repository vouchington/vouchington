import { describe, expect, it } from 'vitest'
import { createTestUserDirect, createTestTopic } from '@voucha/test-helpers'
import { softDeleteUser } from '@voucha/test-helpers/entities/users'
import { startPausedTestUserSoftDeletion } from '@voucha/test-helpers/entities/user-deletion'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { withTopicAttachmentFence } from '@voucha/test-helpers/topic-reference-guard'
import { TOPIC_ELECTION_CONFIG } from '../topic/config.mts'
import { upsertElectionVotesShared } from './vote-upsert.mts'

describe('vote event lifecycle snapshots', () => {
  it('does not fence a pending user deletion or topic attachment lifecycle', async () => {
    const user = await createTestUserDirect()
    const topic = await createTestTopic({ user })
    const deletion = await startPausedTestUserSoftDeletion(user.id)
    try {
      const rows = await withTopicAttachmentFence(topic.id, () =>
        upsertElectionVotesShared(TOPIC_ELECTION_CONFIG, user.id, [
          { entityId: topic.id, score: 1 },
        ]),
      )
      expect(rows).toHaveLength(1)
      deletion.release()
      await deletion.completed
      await expect(
        upsertElectionVotesShared(TOPIC_ELECTION_CONFIG, user.id, [
          { entityId: topic.id, score: -1 },
        ]),
      ).rejects.toMatchObject({ status: 401 })
    } finally {
      deletion.release()
      await deletion.completed
    }
  })

  it('the written statement refuses an event when deletion commits after its preliminary active-user read', async () => {
    const user = await createTestUserDirect()
    const topic = await createTestTopic({ user })
    let deleted = false
    const { result } = await observeTestPostgresClientQueries(
      () =>
        upsertElectionVotesShared(TOPIC_ELECTION_CONFIG, user.id, [
          { entityId: topic.id, score: 1 },
        ]),
      async query => {
        if (!deleted && query.text.includes('/* assertActiveElectionVoter */')) {
          deleted = true
          await softDeleteUser(user.id)
        }
      },
    )
    expect(deleted).toBe(true)
    expect(result).toEqual([])
  })
})
