import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddStatusForm } from '@/components/my/rewards-program-statuses-manager/add-status-form'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const meta = {
  title: 'My/Add Status Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const platinum = topics[4]!

function StatusDraft({ statusId, label }: { statusId: string | null; label: string }) {
  const [id, setId] = useState(statusId)
  const [statusLabel, setStatusLabel] = useState(label)
  return (
    <AddStatusForm
      loading={false}
      newStatusId={id}
      newStatusLabel={statusLabel}
      onAdd={() => {}}
      setNewStatusId={setId}
      setNewStatusLabel={setStatusLabel}
    />
  )
}

export const PlatinumElite: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <StatusDraft
        statusId={platinum.id}
        label={platinum.name}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <StatusDraft
        statusId={null}
        label=''
      />
    </StoryFrame>
  ),
}
