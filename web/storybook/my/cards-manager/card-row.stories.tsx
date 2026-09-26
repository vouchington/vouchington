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

export const ActiveCard: Story = {
  render: () => (
    <StoryFrame>
      <CardDisplayRow
        card={reserve}
        cards={[reserve, freedom]}
        confirmingDeleteId={null}
        loading={false}
        onEdit={() => {}}
        onConfirmDelete={() => {}}
        onCancelDelete={() => {}}
        onStartDelete={() => {}}
      />
    </StoryFrame>
  ),
}

export const AuthorizedUser: Story = {
  render: () => (
    <StoryFrame>
      <CardDisplayRow
        card={freedom}
        cards={[reserve, freedom]}
        confirmingDeleteId={null}
        loading={false}
        onEdit={() => {}}
        onConfirmDelete={() => {}}
        onCancelDelete={() => {}}
        onStartDelete={() => {}}
      />
    </StoryFrame>
  ),
}
