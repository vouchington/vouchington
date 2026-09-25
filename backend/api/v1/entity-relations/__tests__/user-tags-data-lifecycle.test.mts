import { describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import { getUserTagTopics } from '@services/topics/user-tag-topics'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getEntityRelations } from '@services/entity-relations/query'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { streamEntityRelations } from '@services/account-data-requests/stream-entity-relations'
import { streamVotes } from '@services/account-data-requests/stream'
import { deleteUserAndDrainForTest } from '@services/users/delete-test-support'
import { SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations/viewer'

async function collectRows(rows: AsyncGenerator<Record<string, unknown>>) {
  const collected: Record<string, unknown>[] = []
  for await (const row of rows) collected.push(row)
  return collected
}

describe('user tag account-data lifecycle', () => {
  it('exports applied labels and requester votes without voter or creator identity', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'category',
      objectType: 'topic',
    })
    const [relation] = await upsertEntityRelation(voter, metadata, target, [tag!])

    const tagStream = streamEntityRelations(target.id).find(
      stream => stream.tableName === 'relation__user__category__topic',
    )
    expect(tagStream).toBeDefined()
    const labels = await collectRows(tagStream!.rows)
    expect(labels).toContainEqual(
      expect.objectContaining({ object_id: tag!.id, object_label: 'Bot', predicate: 'category' }),
    )
    expect(labels[0]).not.toHaveProperty('created_by_id')
    expect(labels[0]).not.toHaveProperty('user_id')

    const votes = await collectRows(streamVotes(voter.id))
    expect(votes).toContainEqual(
      expect.objectContaining({
        entity_type: 'entity_relation',
        entity_id: relation!.id,
        choice: 'confirm',
      }),
    )
  })

  it('removes user-tag relations when the tagged subject deletes their account', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'category',
      objectType: 'topic',
    })
    await upsertEntityRelation(voter, metadata, target, [tag!])

    await deleteUserAndDrainForTest(target, target)

    await expect(
      getEntityRelations('user', target.id, 'category', 'topic', {
        viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      }),
    ).resolves.toHaveLength(0)
  })
})
