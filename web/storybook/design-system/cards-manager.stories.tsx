import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CardsManager } from '@/components/my/cards-manager'
import { AuthorizedUserSelect } from '@/components/my/cards-manager/authorized-user-select'
import type { IndividualCard } from '@/types/my'
import type { ListResponse } from '@/types/api-responses'
import type { CardEditForm } from '@/components/my/cards-manager/types'

const meta = {
  title: 'Design System/Settings/Cards Manager',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const fixtureCards: IndividualCard[] = [
  {
    id: 'card-owner-1',
    card_id: 'c-1',
    opened_on: '2022-03-15',
    closed_on: null,
    received_sign_up_bonus_on: '2022-06-15',
    credit_limit: { amount: 1_000_000, currency: 'usd' },
    is_authorized_user: false,
    authorized_user_of_id: null,
    note: 'My primary travel card',
    authorized_user_of_card: null,
    card: {
      id: 'c-1',
      name: 'Chase Sapphire Preferred',
      slug: 'chase-sapphire-preferred',
    },
  },
  {
    id: 'card-owner-2',
    card_id: 'c-2',
    opened_on: '2023-11-01',
    closed_on: null,
    received_sign_up_bonus_on: null,
    credit_limit: { amount: 500_000, currency: 'usd' },
    is_authorized_user: true,
    authorized_user_of_id: 'card-owner-1',
    note: null,
    authorized_user_of_card: {
      id: 'card-owner-1',
      opened_on: '2022-03-15',
      closed_on: null,
      card: {
        id: 'c-1',
        name: 'Chase Sapphire Preferred',
        slug: 'chase-sapphire-preferred',
      },
    },
    card: {
      id: 'c-2',
      name: 'Chase Freedom Flex',
      slug: 'chase-freedom-flex',
    },
  },
  {
    id: 'card-owner-3',
    card_id: 'c-3',
    opened_on: '2021-07-20',
    closed_on: '2024-01-01',
    received_sign_up_bonus_on: '2021-10-20',
    credit_limit: { amount: 1_500_000, currency: 'usd' },
    is_authorized_user: false,
    authorized_user_of_id: null,
    note: null,
    authorized_user_of_card: null,
    card: {
      id: 'c-3',
      name: 'Amex Gold',
      slug: 'amex-gold',
    },
  },
]

function makeCardsPage(cards: IndividualCard[]): ListResponse<IndividualCard> {
  return {
    results: cards,
    page_info: { has_next_page: false, start_cursor: cards[0]?.id ?? null, end_cursor: null },
  }
}

function AuthorizedUserSelectFixture() {
  const [editForm, setEditForm] = useState<CardEditForm>({
    opened_on: '2023-11-01',
    closed_on: '',
    received_sign_up_bonus_on: '',
    credit_limit: '5000',
    currency: 'usd',
    is_authorized_user: true,
    authorized_user_of_id: 'card-owner-1',
    note: '',
  })

  return (
    <AuthorizedUserSelect
      card={fixtureCards[1]!}
      cards={fixtureCards}
      editForm={editForm}
      setEditForm={setEditForm}
      loadingMore={false}
      canLoadMore
      loadMoreError={null}
      onLoadMore={() => undefined}
    />
  )
}

export const EmptyState: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <CardsManager initialData={makeCardsPage([])} />
      </div>
    </main>
  ),
}

export const WithCards: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <CardsManager initialData={makeCardsPage(fixtureCards)} />
      </div>
    </main>
  ),
}

export const AuthorizedUserParentPicker: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-md'>
        <AuthorizedUserSelectFixture />
      </div>
    </main>
  ),
}
