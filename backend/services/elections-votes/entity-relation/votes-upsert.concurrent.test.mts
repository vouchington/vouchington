import { describe, expect, it } from 'vitest'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { getLatestTestEntityRelationVoteScore } from '@voucha/test-helpers/entities/entity-relation-votes'
import { createTestPost, createTestTopic, createTestUser } from '@voucha/test-helpers'
import { interceptPostgresTransactionsForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { upsertEntityRelationElectionVotes } from './votes-upsert.mts'

const metadata = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  predicate: 'category',
  objectType: 'topic',
})

async function createFixture() {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  const topic = await createTestTopic({ user })
  const [relation] = await upsertEntityRelation(user, metadata, post, [topic], { vote: false })
  if (!relation?.id) throw new Error('Expected owned category relation')
  return { user, relationId: relation.id }
}

function readScore(userId: string, relationId: string) {
  return getLatestTestEntityRelationVoteScore({
    userId,
    relationId,
    relationTable: metadata.table_name,
  })
}

/** Holds every transaction at its ballot statement until `parties` of them have arrived. */
function meetAtBallotStatement(parties: number): () => void {
  let arrived = 0
  const together = Promise.withResolvers<void>()
  return interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, argumentsList: Parameters<typeof transaction>) {
          const [input] = argumentsList
          const text = typeof input === 'string' ? input : input.text
          if (text.includes('/* upsertEntityRelationElectionVotes */')) {
            arrived += 1
            if (arrived === parties) together.resolve()
            await together.promise
          }
          return Reflect.apply(target, thisArgument, argumentsList)
        },
      }),
  )
}

describe('concurrent entity relation votes without a request lock', () => {
  it('accepts the same vote submitted twice at once', async () => {
    const { user, relationId } = await createFixture()
    const restore = meetAtBallotStatement(2)
    const submit = () =>
      upsertEntityRelationElectionVotes(
        user.id,
        [{ entityId: relationId, score: 1 }],
        undefined,
        metadata,
      )
    let settled: PromiseSettledResult<unknown>[]
    try {
      settled = await Promise.allSettled([submit(), submit()])
    } finally {
      restore()
    }

    expect(settled.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(await readScore(user.id, relationId)).toBe(1)
  })

  it('lets different users vote on the same relation at once', async () => {
    const { relationId } = await createFixture()
    const [first, second] = await Promise.all([createTestUser(), createTestUser()])
    const restore = meetAtBallotStatement(2)
    let settled: PromiseSettledResult<unknown>[]
    try {
      settled = await Promise.allSettled(
        [first, second].map(voter =>
          upsertEntityRelationElectionVotes(
            voter.id,
            [{ entityId: relationId, score: 1 }],
            undefined,
            metadata,
          ),
        ),
      )
    } finally {
      restore()
    }

    expect(settled.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(await readScore(first.id, relationId)).toBe(1)
    expect(await readScore(second.id, relationId)).toBe(1)
  })
})
