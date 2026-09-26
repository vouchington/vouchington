import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CardEditFormView } from '@/components/my/cards-manager/card-edit-form'
import type { CardEditForm } from '@/components/my/cards-manager/types'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { IndividualCard } from '@/types/my'

const meta = {
  title: 'My/Card Edit Form View',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sapphire = topics[1]!

const card: IndividualCard = {
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

const initialForm: CardEditForm = {
  opened_on: '2024-02-11',
  closed_on: '',
  received_sign_up_bonus_on: '2024-05-20',
  credit_limit: '15000.00',
  currency: 'usd',
  is_authorized_user: false,
  authorized_user_of_id: '',
  note: 'Primary card for dining and travel.',
}

function SapphireEditForm() {
  const [editForm, setEditForm] = useState(initialForm)
  return (
    <CardEditFormView
      card={card}
      cards={[card]}
      editForm={editForm}
      loading={false}
      loadingMore={false}
      canLoadMore={false}
      loadMoreError={null}
      setEditForm={setEditForm}
      onLoadMore={() => {}}
      onSave={() => {}}
      onCancel={() => {}}
    />
  )
}

export const SapphireReserve: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <SapphireEditForm />
    </StoryFrame>
  ),
}
