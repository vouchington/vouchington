import {
  createRandomString,
  createTestUser,
  insertTestCard,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { it, expect, beforeAll, describe } from 'vitest'
import { getIndividualCards, getIndividualCardById } from './cards-get.mts'
import {
  createIndividualCard,
  updateIndividualCardById,
  deleteIndividualCardById,
} from './cards.mts'
import type { PrivateUser } from '@services/users/types'
import { decodeCursor, encodeCursor } from '@modules/pagination'

describe('cards.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns only the narrow public card contract with normalized authorized-user state', async () => {
    const contractUser = await createTestUser()
    const cardName = `Contract Card ${createRandomString(8)}`
    const cardId = await insertTestCard({ createdById: contractUser.id, name: cardName })
    const card = await createIndividualCard(contractUser, contractUser, cardId)

    expect(card).toEqual({
      id: card.id,
      card_id: cardId,
      opened_on: null,
      closed_on: null,
      credit_limit: null,
      received_sign_up_bonus_on: null,
      is_authorized_user: false,
      authorized_user_of_id: null,
      note: null,
      card: { id: cardId, name: cardName, slug: expect.any(String) },
      authorized_user_of_card: null,
    })
    expect(card).not.toHaveProperty('individual_id')
    expect(card).not.toHaveProperty('created_at')
    expect(card.card).toEqual({ id: cardId, name: cardName, slug: expect.any(String) })
  })

  it('hydrates a same-owner nonrecursive authorized-user parent summary', async () => {
    const parentUser = await createTestUser()
    const primaryName = `Primary Card ${createRandomString(8)}`
    const [parentTopicId, childTopicId] = await Promise.all([
      insertTestCard({ createdById: parentUser.id, name: primaryName }),
      insertTestCard({
        createdById: parentUser.id,
        name: `Authorized Card ${createRandomString(8)}`,
      }),
    ])
    const parent = await createIndividualCard(parentUser, parentUser, parentTopicId)
    const child = await createIndividualCard(parentUser, parentUser, childTopicId)
    await updateIndividualCardById(parentUser, parentUser, parent.id, {
      opened_on: '2022-05-01',
    })

    const updated = await updateIndividualCardById(parentUser, parentUser, child.id, {
      is_authorized_user: true,
      authorized_user_of_id: parent.id,
    })

    expect(updated.authorized_user_of_card).toEqual({
      id: parent.id,
      opened_on: '2022-05-01',
      closed_on: null,
      card: { id: parentTopicId, name: primaryName, slug: expect.any(String) },
    })
    expect(updated.authorized_user_of_card).not.toHaveProperty('authorized_user_of_card')
  })

  it('paginates cards by scoped ascending UUID cursor without gaps or duplicates', async () => {
    const paginationUser = await createTestUser()
    const nameSuffix = createRandomString(8)
    const topicIds = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        insertTestCard({
          createdById: paginationUser.id,
          name: `Page Card ${nameSuffix} ${index}`,
        }),
      ),
    )
    const created = []
    for (const topicId of topicIds) {
      created.push(await createIndividualCard(paginationUser, paginationUser, topicId))
    }

    const first = await getIndividualCards(paginationUser, paginationUser, { limit: 2 })
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.page_info.end_cursor).toBeTruthy()
    const second = await getIndividualCards(paginationUser, paginationUser, {
      limit: 2,
      after: first.page_info.end_cursor!,
    })
    const ids = [...first.results, ...second.results].map(card => card.id)

    expect(ids).toEqual(created.map(card => card.id).sort())
    expect(new Set(ids).size).toBe(ids.length)
    expect(second.page_info.has_next_page).toBe(false)
    expect(second.page_info.end_cursor).toBeNull()
  })

  it('paginates past cards whose referenced topic is no longer visible', async () => {
    const paginationUser = await createTestUser()
    const suffix = createRandomString(8)
    const hiddenTopicId = await insertTestCard({
      createdById: paginationUser.id,
      name: `Hidden Card ${suffix}`,
    })
    await createIndividualCard(paginationUser, paginationUser, hiddenTopicId)
    await softDeleteTopic(hiddenTopicId, paginationUser.id)
    const visibleTopicIds = await Promise.all([
      insertTestCard({ createdById: paginationUser.id }),
      insertTestCard({ createdById: paginationUser.id }),
    ])
    const visibleCards = []
    for (const topicId of visibleTopicIds) {
      visibleCards.push(await createIndividualCard(paginationUser, paginationUser, topicId))
    }

    const first = await getIndividualCards(paginationUser, paginationUser, { limit: 1 })
    expect(first.results.map(card => card.id)).toEqual([visibleCards[0]!.id])
    expect(first.page_info.has_next_page).toBe(true)

    const second = await getIndividualCards(paginationUser, paginationUser, {
      after: first.page_info.end_cursor!,
      limit: 1,
    })
    expect(second.results.map(card => card.id)).toEqual([visibleCards[1]!.id])
  })

  it('rejects malformed, tampered, and wrong-owner card cursors', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const topicId = await insertTestCard({ createdById: firstUser.id })
    await createIndividualCard(firstUser, firstUser, topicId)
    const page = await getIndividualCards(firstUser, firstUser, { limit: 1 })
    const cursor = page.page_info.start_cursor!
    const decoded = decodeCursor(cursor) as { id: string; scope: string }

    await expect(
      getIndividualCards(firstUser, firstUser, { after: 'not-a-cursor' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      getIndividualCards(firstUser, firstUser, {
        after: encodeCursor({ ...decoded, scope: `${decoded.scope}:tampered` }),
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      getIndividualCards(secondUser, secondUser, { after: cursor }),
    ).rejects.toMatchObject({ status: 400 })
  })
  it('createIndividualCard - creates a card for individual', async () => {
    const cardId = await insertTestCard({
      createdById: user.id,
    })
    const individualCard = await createIndividualCard(user, user, cardId)

    expect(individualCard).toBeDefined()
    expect(individualCard.card_id).toBe(cardId)
    expect(individualCard).not.toHaveProperty('individual_id')
    expect(individualCard.card).toBeDefined()
    expect(individualCard.card.id).toBe(cardId)
  })

  it('createIndividualCard - requires authentication', async () => {
    const cardId = await insertTestCard({
      createdById: user.id,
    })
    await expect(createIndividualCard(null, user, cardId)).rejects.toThrow(Error)
  })

  it('getIndividualCards - returns all cards for user', async () => {
    const cardId = await insertTestCard({
      createdById: user.id,
    })
    const created = await createIndividualCard(user, user, cardId)
    const cards = await getIndividualCards(user, user)

    expect(cards).toBeDefined()
    expect(cards.results.length).toBeGreaterThan(0)
    expect(cards.results.some(c => c.id === created.id)).toBe(true)
  })

  it('getIndividualCardById - returns specific card', async () => {
    const cardId = await insertTestCard({
      createdById: user.id,
    })
    const created = await createIndividualCard(user, user, cardId)
    const retrieved = await getIndividualCardById(user, user, created.id)

    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe(created.id)
    expect(retrieved?.card_id).toBe(cardId)
  })

  it('updateIndividualCardById - updates card details', async () => {
    const cardId = await insertTestCard({
      createdById: user.id,
    })
    const created = await createIndividualCard(user, user, cardId)
    const updated = await updateIndividualCardById(user, user, created.id, {
      credit_limit: { amount: 5000, currency: 'usd' },
      opened_on: '2024-01-15',
      note: 'My favorite card',
    })

    expect(updated).toBeDefined()
    expect(updated.credit_limit).toEqual({ amount: 5000, currency: 'usd' })
    expect(updated.opened_on).toBeDefined()
    expect(updated.note).toBe('My favorite card')
  })

  it('updateIndividualCardById - handles date conversion', async () => {
    const cardId = await insertTestCard({
      createdById: user.id,
    })
    const created = await createIndividualCard(user, user, cardId)
    const testDate = new Date('2024-06-15')
    const updated = await updateIndividualCardById(user, user, created.id, {
      opened_on: testDate,
    })

    expect(updated).toBeDefined()
    expect(updated.opened_on).toBe('2024-06-15')
  })

  it('deleteIndividualCardById - deletes card', async () => {
    const cardId = await insertTestCard({
      createdById: user.id,
    })
    const created = await createIndividualCard(user, user, cardId)
    const deleted = await deleteIndividualCardById(user, user, created.id)

    expect(deleted).toBeDefined()
    expect(deleted.id).toBe(created.id)

    const retrieved = await getIndividualCardById(user, user, created.id)
    expect(retrieved).toBeUndefined()
  })

  it('deleteIndividualCardById - throws 404 for unknown id', async () => {
    await expect(
      deleteIndividualCardById(user, user, '00000000-0000-7000-8000-000000000000'),
    ).rejects.toThrow(Error)
  })

  it('createIndividualCard - throws 422 for invalid card_id', async () => {
    await expect(
      createIndividualCard(user, user, '00000000-0000-7000-8000-000000000000'),
    ).rejects.toThrow(Error)
  })

  it('updateIndividualCardById - throws 422 for invalid date format', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const created = await createIndividualCard(user, user, cardId)
    await expect(
      updateIndividualCardById(user, user, created.id, { opened_on: 'not-a-date' }),
    ).rejects.toThrow(Error)
  })

  it('updateIndividualCardById - throws 422 for an impossible calendar date', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const created = await createIndividualCard(user, user, cardId)

    await expect(
      updateIndividualCardById(user, user, created.id, { opened_on: '2026-02-31' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('updateIndividualCardById - throws 422 for authorized_user_of_id not owned by user', async () => {
    const cardId = await insertTestCard({ createdById: user.id })
    const created = await createIndividualCard(user, user, cardId)
    await expect(
      updateIndividualCardById(user, user, created.id, {
        is_authorized_user: true,
        authorized_user_of_id: '00000000-0000-7000-8000-000000000000',
      }),
    ).rejects.toThrow(Error)
  })

  it('updateIndividualCardById - throws 422 when is_authorized_user is false but authorized_user_of_id is set', async () => {
    const cardId1 = await insertTestCard({ createdById: user.id })
    const cardId2 = await insertTestCard({ createdById: user.id })
    const card1 = await createIndividualCard(user, user, cardId1)
    const card2 = await createIndividualCard(user, user, cardId2)
    await expect(
      updateIndividualCardById(user, user, card1.id, {
        is_authorized_user: false,
        authorized_user_of_id: card2.id,
      }),
    ).rejects.toThrow(Error)
  })
})
