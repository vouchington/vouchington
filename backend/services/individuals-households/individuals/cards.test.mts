import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  deleteForeignKeyTargetDuringInsertForTest,
  insertTestCard,
} from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { createIndividualCard } from './cards.mts'
import { getIndividualCards } from './cards-get.mts'

describe('individual card storage errors', () => {
  it('accepts active card topics without a card extension row', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user, topic_type: 'card' })

    await expect(createIndividualCard(user, user, topic.id)).resolves.toMatchObject({
      card_topic_id: topic.id,
    })
  })

  it('returns not found when a card topic is deleted during the insert FK check', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user, topic_type: 'card' })
    const outcome = await deleteForeignKeyTargetDuringInsertForTest({
      queryMarker: '/* createIndividualCard */',
      lockTarget: async query => {
        await query('/* lockTestCardTopic */ SELECT id FROM topics WHERE id = $1 FOR UPDATE', [
          topic.id,
        ])
      },
      deleteTarget: async query => {
        await query('/* deleteTestCardTopic */ DELETE FROM topics WHERE id = $1', [topic.id])
      },
      operation: () => createIndividualCard(user, user, topic.id),
    })

    expect(outcome).toMatchObject({ error: { status: 404, message: 'Topic not found' } })
  })

  it('preserves the former validation response when the owner FK fails during insert', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user, topic_type: 'card' })
    const outcome = await deleteForeignKeyTargetDuringInsertForTest({
      queryMarker: '/* createIndividualCard */',
      lockTarget: async query => {
        await query('/* lockTestCardOwner */ SELECT id FROM individuals WHERE id = $1 FOR UPDATE', [
          user.individual_id!,
        ])
      },
      deleteTarget: async query => {
        await query('/* deleteTestCardOwner */ DELETE FROM individuals WHERE id = $1', [
          user.individual_id!,
        ])
      },
      operation: () => createIndividualCard(user, user, topic.id),
    })

    expect(outcome).toMatchObject({
      error: { status: 422, message: 'Invalid card_topic_id' },
    })
  })

  it('preserves the actual generic INSERT error without claiming that a valid card id is invalid', async () => {
    const user = await createTestUser()
    const cardId = await insertTestCard({ createdById: user.id, name: `Card ${user.id}` })
    const failure = await withPostgresPoolQueryFailureForTest('/* createIndividualCard */', () =>
      createIndividualCard(user, user, cardId).catch((err: unknown) => err),
    )

    expect(failure.result).toMatchObject({ code: '25P02' })
    expect(failure.result).toBe(failure.error)
    expect((await getIndividualCards(user, user)).results).toEqual([])
    await expect(createIndividualCard(user, user, cardId)).resolves.toMatchObject({
      card_topic_id: cardId,
    })
    expect((await getIndividualCards(user, user)).results).toHaveLength(1)
  })
})
