import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ValuationList } from '@/components/my/point-valuations-manager/valuation-list'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { PointValuation } from '@/types/my'
import type { CurrencyCode } from '@ts-shared/money'

const meta = {
  title: 'My/Valuation List',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const ultimateRewards = topics[3]!

const valuations: PointValuation[] = [
  {
    id: 'valuation-ultimate-rewards',
    rewards_program_id: ultimateRewards.id,
    value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
    note: 'What I use for international business class.',
    rewards_program: {
      id: ultimateRewards.id,
      name: ultimateRewards.name,
      slug: ultimateRewards.slug,
    },
  },
  {
    id: 'valuation-membership-rewards',
    rewards_program_id: 'topic-membership-rewards',
    value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
    note: null,
    rewards_program: {
      id: 'topic-membership-rewards',
      name: 'Membership Rewards',
      slug: 'membership-rewards',
    },
  },
]

const emptyEditForm = { value_per_point: '0.015', currency: 'usd' as const, note: '' }

function ValuationRows() {
  const [rows, setRows] = useState(valuations)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    value_per_point: string
    currency: CurrencyCode
    note: string
  }>({
    value_per_point: '0.015',
    currency: 'usd',
    note: '',
  })
  return (
    <ValuationList
      confirmingDeleteId={confirmingDeleteId}
      editForm={editForm}
      editingId={editingId}
      loadingIds={new Set()}
      valuations={rows}
      onDelete={id => setRows(current => current.filter(row => row.id !== id))}
      onSave={id => {
        setRows(current =>
          current.map(row => (row.id === id ? { ...row, note: editForm.note || null } : row)),
        )
        setEditingId(null)
      }}
      onStartEdit={valuation => {
        setEditingId(valuation.id)
        setEditForm({
          value_per_point: '0.015',
          currency: 'usd',
          note: valuation.note ?? '',
        })
      }}
      setConfirmingDeleteId={setConfirmingDeleteId}
      setEditForm={setEditForm}
      setEditingId={setEditingId}
    />
  )
}

export const WithValuations: Story = {
  render: () => (
    <StoryFrame>
      <ValuationRows />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <ValuationList
        confirmingDeleteId={null}
        editForm={emptyEditForm}
        editingId={null}
        loadingIds={new Set()}
        valuations={[]}
        onDelete={() => {}}
        onSave={() => {}}
        onStartEdit={() => {}}
        setConfirmingDeleteId={() => {}}
        setEditForm={() => {}}
        setEditingId={() => {}}
      />
    </StoryFrame>
  ),
}
