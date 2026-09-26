import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { StatusSummary } from '@/components/my/rewards-program-statuses-manager/status-summary'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { RewardsProgramStatus } from '@/types/my'

const meta = {
  title: 'My/Status Summary',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const platinum = topics[4]!

const status: RewardsProgramStatus = {
  id: 'status-platinum-elite',
  rewards_program_status_id: platinum.id,
  since: '2024-03-01',
  until: null,
  rewards_program_status: { id: platinum.id, name: platinum.name, slug: platinum.slug },
}

export const CurrentStatus: Story = {
  render: () => (
    <StoryFrame>
      <StatusSummary
        confirmingDeleteId={null}
        loading={false}
        onCancelDelete={() => {}}
        onConfirmDelete={() => {}}
        onStartDelete={() => {}}
        onStartEdit={() => {}}
        status={status}
      />
    </StoryFrame>
  ),
}

export const ConfirmingRemoval: Story = {
  render: () => (
    <StoryFrame>
      <StatusSummary
        confirmingDeleteId={status.id}
        loading={false}
        onCancelDelete={() => {}}
        onConfirmDelete={() => {}}
        onStartDelete={() => {}}
        onStartEdit={() => {}}
        status={status}
      />
    </StoryFrame>
  ),
}
