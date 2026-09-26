import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CardDisplayRow } from '@/components/my/cards-manager/card-row'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { IndividualCard } from '@/types/my'

const meta = {
  title: 'My/Card Display Row',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sapphire = topics[1]!

const reserve: IndividualCard = {
  id: 'card-sapphire-reserve',
  card_id: sapphire.id,
  opened_on: '2024-02-11',
  closed_on: null,
  received_sign_up_bonus_on: '2024-05-20',
  credit_limit: { amount: 1_500_000, currency: 'usd' },
  is_authorized_user: false,
  authorized_user_of_id: null,
  note: 'Primary card for dining and travel.',
  authorized_user_of_card: null,
  card: { id: sapphire.id, name: sapphire.name, slug: sapphire.slug },
}

const freedom: IndividualCard = {
  id: 'card-freedom-flex',
  card_id: 'topic-freedom-flex',
  opened_on: '2023-08-01',
  closed_on: null,
  received_sign_up_bonus_on: null,
  credit_limit: { amount: 800_000, currency: 'usd' },
  is_authorized_user: true,
  authorized_user_of_id: reserve.id,
  note: null,
  authorized_user_of_card: {
    id: reserve.id,
    opened_on: reserve.opened_on,
    closed_on: null,
    card: reserve.card,
  },
  card: { id: 'topic-freedom-flex', name: 'Freedom Flex', slug: 'freedom-flex' },
}

function CardRow({ card }: { card: IndividualCard }) {
  const [editing, setEditing] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  if (removed) return <p>Removed {card.card.name}</p>
  if (editing) return <p>Editing {card.card.name}</p>
  return (
    <CardDisplayRow
      card={card}
      cards={[reserve, freedom]}
      confirmingDeleteId={confirmingDeleteId}
      loading={false}
      onEdit={() => setEditing(true)}
      onConfirmDelete={() => setRemoved(true)}
      onCancelDelete={() => setConfirmingDeleteId(null)}
      onStartDelete={() => setConfirmingDeleteId(card.id)}
    />
  )
}

export const ActiveCard: Story = {
  render: () => (
    <StoryFrame>
      <CardRow card={reserve} />
    </StoryFrame>
  ),
}

export const AuthorizedUser: Story = {
  render: () => (
    <StoryFrame>
      <CardRow card={freedom} />
    </StoryFrame>
  ),
}
