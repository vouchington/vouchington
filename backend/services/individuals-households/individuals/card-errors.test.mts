import { describe, expect, it } from 'vitest'
import { mapIndividualCardConstraintError } from './card-errors.mts'

describe('individual card constraint errors', () => {
  it.each([
    ['23503', 'individual_cards_authorized_user_of_id_fkey', 'Invalid authorized_user_of_id'],
    [
      '23514',
      'individual_cards_check1',
      'is_authorized_user must be true when authorized_user_of_id is set',
    ],
  ])('maps %s:%s to a precise domain error', async (code, constraint, message) => {
    await expect(
      mapIndividualCardConstraintError(() => Promise.reject({ code, constraint })),
    ).rejects.toMatchObject({ status: 422, message })
  })

  it('passes unrelated database errors through unchanged', async () => {
    const error = { code: '23503', constraint: 'individual_cards_currency_code_fkey' }

    await expect(mapIndividualCardConstraintError(() => Promise.reject(error))).rejects.toBe(error)
  })
})
