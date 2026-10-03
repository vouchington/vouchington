import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCard,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { getIndividualCards } from '@services/individuals-households'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

describe('my card suspension policy', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('blocks writes on a pre-suspension session while preserving reads', async () => {
    const user = await createTestUser()
    const originalCatalogCardId = await insertTestCard({ createdById: user.id })
    const attemptedCatalogCardId = await insertTestCard({ createdById: user.id })
    const request = createRequest()
    await request.authenticateAs(user)
    const created = await request
      .post('/api/v1/my/cards')
      .send({ card_id: originalCatalogCardId })
      .expect(201)
    const cardId = created.body.card.id as string

    suspendedUserIds.push(user.id)
    await suspendTestUser(user.id)

    const read = await request.get('/api/v1/my/cards').expect(200)
    expect(read.body.results.map((card: { id: string }) => card.id)).toContain(cardId)

    for (const response of [
      await request.post('/api/v1/my/cards').send({ card_id: attemptedCatalogCardId }),
      await request.patch(`/api/v1/my/cards/${cardId}`).send({ note: 'suspended edit' }),
      await request.delete(`/api/v1/my/cards/${cardId}`),
    ]) {
      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    }

    const persisted = await getIndividualCards(user, user, { limit: 100 })
    expect(persisted.results).toHaveLength(1)
    expect(persisted.results[0]).toMatchObject({ id: cardId, note: null })
  })
})
