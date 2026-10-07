import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { StatusList } from '@/components/my/rewards-program-statuses-manager/status-list'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { RewardsProgramStatus } from '@/types/my'

const meta = {
  title: 'My/Status List',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const platinum = topics[4]!

const statuses: RewardsProgramStatus[] = [
  {
    id: 'status-platinum-elite',
    rewards_program_status_topic_id: platinum.id,
    started_on: '2024-03-01',
    expires_on: null,
    rewards_program_status: { id: platinum.id, name: platinum.name, slug: platinum.slug },
  },
]

const emptyEditForm = { started_on: '2024-03-01', expires_on: '' }

function StatusRows() {
  const [rows, setRows] = useState(statuses)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyEditForm)
  return (
    <StatusList
      confirmingDeleteId={confirmingDeleteId}
      editForm={editForm}
      editingId={editingId}
      loadingIds={new Set()}
      statuses={rows}
      onDelete={id => setRows(current => current.filter(row => row.id !== id))}
      onSave={id => {
        setRows(current =>
          current.map(row =>
            row.id === id
              ? { ...row, started_on: editForm.started_on, expires_on: editForm.expires_on || null }
              : row,
          ),
        )
        setEditingId(null)
      }}
      onStartEdit={status => {
        setEditingId(status.id)
        setEditForm({ started_on: status.started_on ?? '', expires_on: status.expires_on ?? '' })
      }}
      setConfirmingDeleteId={setConfirmingDeleteId}
      setEditForm={setEditForm}
      setEditingId={setEditingId}
    />
  )
}

export const PlatinumElite: Story = {
  render: () => (
    <StoryFrame>
      <StatusRows />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <StatusList
        confirmingDeleteId={null}
        editForm={emptyEditForm}
        editingId={null}
        loadingIds={new Set()}
        statuses={[]}
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
