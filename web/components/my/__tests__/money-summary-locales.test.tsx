import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import type { IndividualCard, SpendingCategory } from '@/types/my'
import esMessages from '@ts-shared/ui-messages/messages/es'
import { CardDisplayRow } from '../cards-manager/card-row'
import { CategorySummary } from '../spending-categories-manager/category-summary'

const noOp = vi.fn<() => void>()

describe('money summaries', () => {
  it('formats card credit limits with the active UI locale', () => {
    seedMessages('es', esMessages)
    const card: IndividualCard = {
      id: 'card-1',
      card_id: 'topic-1',
      opened_on: null,
      closed_on: null,
      received_sign_up_bonus_on: null,
      credit_limit: { amount: 1_000_000, currency: 'usd' },
      is_authorized_user: false,
      authorized_user_of_id: null,
      note: null,
      authorized_user_of_card: null,
      card: { id: 'topic-1', name: 'Travel Card', slug: 'travel-card' },
    }

    render(
      <UiLocaleProvider uiLocale='es'>
        <CardDisplayRow
          card={card}
          cards={[card]}
          confirmingDeleteId={null}
          loading={false}
          onEdit={noOp}
          onConfirmDelete={noOp}
          onCancelDelete={noOp}
          onStartDelete={noOp}
        />
      </UiLocaleProvider>,
    )

    expect(screen.getByText(/10.000,00 US\$/)).toBeInTheDocument()
    expect(screen.queryByText(/\$10,000\.00/)).not.toBeInTheDocument()
  })

  it('formats spending amounts with the active UI locale', () => {
    seedMessages('es', esMessages)
    const category: SpendingCategory = {
      id: 'spending-1',
      spending_category_id: 'category-1',
      amount: { amount: 15_000, currency: 'usd' },
      spending_frequency: 'monthly',
      note: null,
      spending_category: { id: 'category-1', name: 'Coffee', slug: 'coffee' },
    }

    render(
      <UiLocaleProvider uiLocale='es'>
        <CategorySummary
          category={category}
          confirmingDeleteId={null}
          loading={false}
          onCancelDelete={noOp}
          onConfirmDelete={noOp}
          onStartDelete={noOp}
          onStartEdit={noOp}
        />
      </UiLocaleProvider>,
    )

    expect(screen.getByText(/150,00 US\$ \/ Mensual/)).toBeInTheDocument()
    expect(screen.queryByText(/\$150\.00/)).not.toBeInTheDocument()
  })
})
