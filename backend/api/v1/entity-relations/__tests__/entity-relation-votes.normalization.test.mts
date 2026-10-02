import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestPost,
  createTestTopic,
  createTestUserWithAge,
  getEntityRelationVoteStorageRows,
} from '@voucha/test-helpers'
import { enableQueryCapture, stopTestQueryCapture } from '@voucha/test-helpers/query-capture'
import { upsertEntityRelation } from '@services/entity-relations'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation'

async function createFixture() {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  const [post, topic] = await Promise.all([createTestPost({ user }), createTestTopic({ user })])
  const metadata = entityRelationMetadatum.find(
    item => item.table_name === 'relation__post__category__topic',
  )!
  const [relation] = await upsertEntityRelation(user, metadata, post, [topic], { vote: false })
  return {
    user,
    metadata,
    relationId: relation!.id!,
    table: getEntityRelationVoteTableName(metadata),
  }
}

function expectConcreteWrite(
  queries: ReturnType<typeof stopTestQueryCapture>,
  table: string,
  userId: string,
  relationId: string,
) {
  const locks = queries.filter(query =>
    query.text.includes('/* lockEntityRelationElectionVoteMutations */'),
  )
  expect(locks).toHaveLength(1)
  expect(locks[0]!.values).toEqual([[`${table}:${userId}:${relationId}`]])
  const write = queries.find(query =>
    query.text.includes('/* upsertEntityRelationElectionVotes */'),
  )!
  expect(write.text.match(/INSERT INTO/g)).toHaveLength(1)
  expect(write.text).toContain(`INSERT INTO ${table}`)
}

describe('relation vote normalized concrete identity', () => {
  it('normalizes and deduplicates internal mixed-case ids before locking and appending', async () => {
    const { user, metadata, relationId, table } = await createFixture()
    enableQueryCapture()
    try {
      await upsertEntityRelationElectionVotes(
        user.id.toUpperCase(),
        [
          { entityId: relationId.toUpperCase(), score: 1 },
          { entityId: relationId, score: 1 },
        ],
        undefined,
        metadata,
        { enqueueVoteStats: false },
      )
      expectConcreteWrite(stopTestQueryCapture(), table, user.id, relationId)
      await upsertEntityRelationElectionVotes(
        user.id,
        [{ entityId: relationId, score: 1 }],
        undefined,
        metadata,
        { enqueueVoteStats: false },
      )
      expect(await getEntityRelationVoteStorageRows([relationId])).toHaveLength(1)
    } finally {
      stopTestQueryCapture()
    }
  })

  it('accepts upper-case route ids and locks/writes only the resolved relation', async () => {
    const { user, relationId, table } = await createFixture()
    const request = createRequest()
    await request.authenticateAs(user)
    enableQueryCapture()
    try {
      await request
        .put(`/api/v1/entity-relations/${relationId.toUpperCase()}/vote`)
        .send({ choice: 'confirm' })
        .expect(204)
      const queries = stopTestQueryCapture()
      expectConcreteWrite(queries, table, user.id, relationId)
      await request
        .put(`/api/v1/entity-relations/${relationId}/vote`)
        .send({ choice: 'confirm' })
        .expect(204)
      expect(await getEntityRelationVoteStorageRows([relationId])).toHaveLength(1)
    } finally {
      stopTestQueryCapture()
    }
  })
})
