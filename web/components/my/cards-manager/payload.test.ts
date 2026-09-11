import { describe, expect, it } from 'vitest'
import { buildCardUpdatePayload, cardToEditForm } from './payload'
import type { IndividualCard } from '@/types/my'

const card: IndividualCard = {
  id: 'card-1',
  card_id: 'topic-1',
  opened_on: '2024-01-01',
  closed_on: null,
  received_sign_up_bonus_on: null,
  credit_limit: { amount: 100_000, currency: 'usd' },
  is_authorized_user: false,
  authorized_user_of_id: null,
  note: null,
  card: { id: 'topic-1', name: 'Named card', slug: 'named-card' },
  authorized_user_of_card: null,
}

describe('buildCardUpdatePayload', () => {
  it('returns null for a no-op edit', () => {
    expect(buildCardUpdatePayload(card, cardToEditForm(card), 'en')).toBeNull()
  })

  it('rejects malformed and negative credit limits without clearing the original', () => {
    const form = cardToEditForm(card)
    expect(buildCardUpdatePayload(card, { ...form, credit_limit: '12oops' }, 'en')).toBe(
      'invalid-credit-limit',
    )
    expect(buildCardUpdatePayload(card, { ...form, credit_limit: '-1' }, 'en')).toBe(
      'invalid-credit-limit',
    )
  })

  it('treats an unchanged zero credit limit as a no-op', () => {
    const zeroLimitCard = { ...card, credit_limit: { amount: 0, currency: 'usd' } as const }

    expect(buildCardUpdatePayload(zeroLimitCard, cardToEditForm(zeroLimitCard), 'en')).toBeNull()
  })

  it('clears a zero credit limit when the draft is emptied', () => {
    const zeroLimitCard = { ...card, credit_limit: { amount: 0, currency: 'usd' } as const }

    expect(
      buildCardUpdatePayload(
        zeroLimitCard,
        {
          ...cardToEditForm(zeroLimitCard),
          credit_limit: '',
        },
        'en',
      ),
    ).toEqual({ credit_limit: null })
  })

  it('parses a comma-decimal credit limit using the active locale', () => {
    expect(
      buildCardUpdatePayload(card, { ...cardToEditForm(card), credit_limit: '1234,56' }, 'pt'),
    ).toEqual({ credit_limit: { amount: 123_456, currency: 'usd' } })
  })
})
