import { beforeAll, describe, expect, it } from 'vitest'
import manageMyCardsTool from './manage-my-cards.mts'
import getMyCardsTool from './get-my-cards.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestCard } from '@voucha/test-helpers/entities/cards'
import type { PrivateUser } from '@services/users/types'

describe('manage_my_cards tool — real DB', () => {
  let user: PrivateUser
  let cardId: string

  beforeAll(async () => {
    user = await createTestUser()
    cardId = await insertTestCard({ createdById: user.id })
  })

  it('forwards after and limit for list pagination', async () => {
    const paginationUser = await createTestUser()
    const execute = manageMyCardsTool.function(paginationUser)
    for (let index = 0; index < 2; index += 1) {
      const topicId = await insertTestCard({ createdById: paginationUser.id })
      await execute({ action: 'add', card_id: topicId })
    }

    const list = getMyCardsTool.function(paginationUser)
    const first = await list({ limit: 1 })
    const firstPage = first.result as {
      results: Array<{ id: string }>
      page_info: { has_next_page: boolean; end_cursor: string | null }
    }
    expect(firstPage.results).toHaveLength(1)
    expect(firstPage.page_info.has_next_page).toBe(true)

    const second = await list({
      limit: 1,
      after: firstPage.page_info.end_cursor!,
    })
    expect((second.result as { results: unknown[] }).results).toHaveLength(1)
  })
  it('list returns empty initially', async () => {
    const freshUser = await createTestUser()
    const result = await getMyCardsTool.function(freshUser)({})
    expect(result.success).toBe(true)
    expect(Array.isArray((result.result as { results: unknown[] }).results)).toBe(true)
    expect((result.result as { results: unknown[] }).results).toHaveLength(0)
  })

  it('add creates a card', async () => {
    const execute = manageMyCardsTool.function(user)
    const result = await execute({ action: 'add', card_id: cardId })
    expect(result.success).toBe(true)
    expect(result.result).toHaveProperty('id')
    expect((result.result as { card_id: string }).card_id).toBe(cardId)
  })

  it('list after add returns the card', async () => {
    const result = await getMyCardsTool.function(user)({})
    expect(result.success).toBe(true)
    const cards = (result.result as { results: Array<{ card_id: string }> }).results
    expect(cards.some(c => c.card_id === cardId)).toBe(true)
  })

  it('update modifies fields', async () => {
    const addExecute = manageMyCardsTool.function(user)
    const cardId2 = await insertTestCard({ createdById: user.id })
    const added = (await addExecute({ action: 'add', card_id: cardId2 })).result as { id: string }

    const execute = manageMyCardsTool.function(user)
    const result = await execute({
      action: 'update',
      id: added.id,
      note: 'test note',
      credit_limit: { amount: 50_000_000, currency: 'usd' },
    })
    expect(result.success).toBe(true)
    expect((result.result as { note: string }).note).toBe('test note')
    expect((result.result as { credit_limit: unknown }).credit_limit).toEqual({
      amount: 50_000_000,
      currency: 'usd',
    })
  })

  it('publishes nullable schemas and clears an AU parent plus credit limit', async () => {
    expect(manageMyCardsTool.schema.parameters).toMatchObject({
      properties: {
        opened_on: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        closed_on: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        received_sign_up_bonus_on: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        credit_limit: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['amount', 'currency'],
              properties: {
                amount: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                currency: { type: 'string' },
              },
            },
            { type: 'null' },
          ],
        },
        note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        authorized_user_of_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
    })

    const execute = manageMyCardsTool.function(user)
    const [childTopicId, parentTopicId] = await Promise.all([
      insertTestCard({ createdById: user.id }),
      insertTestCard({ createdById: user.id }),
    ])
    const child = (await execute({ action: 'add', card_id: childTopicId })).result as { id: string }
    const parent = (await execute({ action: 'add', card_id: parentTopicId })).result as {
      id: string
    }
    await execute({
      action: 'update',
      id: child.id,
      credit_limit: { amount: 500_000, currency: 'usd' },
      is_authorized_user: true,
      authorized_user_of_id: parent.id,
    })

    const cleared = await execute({
      action: 'update',
      id: child.id,
      credit_limit: null,
      is_authorized_user: false,
      authorized_user_of_id: null,
    })

    expect(cleared.result).toMatchObject({
      credit_limit: null,
      is_authorized_user: false,
      authorized_user_of_id: null,
    })
  })

  it('remove deletes the card', async () => {
    const addExecute = manageMyCardsTool.function(user)
    const cardId3 = await insertTestCard({ createdById: user.id })
    const added = (await addExecute({ action: 'add', card_id: cardId3 })).result as { id: string }

    const execute = manageMyCardsTool.function(user)
    const result = await execute({ action: 'remove', id: added.id })
    expect(result.success).toBe(true)
    expect((result.result as { id: string }).id).toBe(added.id)
  })
})
