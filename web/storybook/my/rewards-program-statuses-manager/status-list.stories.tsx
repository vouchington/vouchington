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
    rewards_program_status_id: platinum.id,
    since: '2024-03-01',
    until: null,
    rewards_program_status: { id: platinum.id, name: platinum.name, slug: platinum.slug },
  },
]

const editForm = { since: '2024-03-01', until: '' }

export const PlatinumElite: Story = {
  render: () => (
    <StoryFrame>
      <StatusList
        confirmingDeleteId={null}
        editForm={editForm}
        editingId={null}
        loadingIds={new Set()}
        statuses={statuses}
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

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <StatusList
        confirmingDeleteId={null}
        editForm={editForm}
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
