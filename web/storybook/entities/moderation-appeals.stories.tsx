import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { AppealsClient } from '@/components/appeals/appeals-client'
import { AppealContext } from '@/components/appeals/appeal-context'
import { AppealDetail } from '@/components/appeals/appeal-detail'
import { AppealDetailDialog } from '@/components/appeals/appeal-detail-dialog'
import { AppealRow } from '@/components/appeals/appeal-row'
import { MemberAppealRow } from '@/components/appeals/member-appeal-row'
import { toModerationAppealSummary } from '@/types/appeals'
import { EntityStoryFrame } from './entity-story-frame'
import { pendingAppeal, resolvedAppeal, staffData, memberData } from './fixtures/moderation-appeals'

const meta = {
  title: 'Entities/Admin/Moderation Appeals',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const StaffQueue: Story = {
  render: () => (
    <EntityStoryFrame
      title='Moderation Appeals — Staff'
      description='Staff queue with AI draft, staged approve/send controls, and resolution actions.'
    >
      <AppealsClient
        viewerTier='staff'
        viewerRole='administrator'
        data={staffData}
      />
    </EntityStoryFrame>
  ),
}

export const MemberQueue: Story = {
  render: () => (
    <EntityStoryFrame
      title='Moderation Appeals — Member'
      description='Redacted public view: target type, status, and sent response only.'
    >
      <AppealsClient
        viewerTier='member'
        viewerRole='member'
        data={memberData}
      />
    </EntityStoryFrame>
  ),
}

export const StaffRow: Story = {
  render: () => (
    <EntityStoryFrame title='Appeal Row (staff)'>
      <table className='min-w-full divide-y divide-border'>
        <tbody className='divide-y divide-border bg-card'>
          <AppealRow
            appeal={toModerationAppealSummary(pendingAppeal)}
            disabled={false}
            onOpen={fn()}
          />
        </tbody>
      </table>
    </EntityStoryFrame>
  ),
}

export const Context: Story = {
  render: () => (
    <EntityStoryFrame title='Appeal Context'>
      <AppealContext appeal={toModerationAppealSummary(pendingAppeal)} />
    </EntityStoryFrame>
  ),
}

export const MemberRow: Story = {
  render: () => (
    <EntityStoryFrame title='Appeal Row (member, redacted)'>
      <table className='min-w-full divide-y divide-border'>
        <tbody className='divide-y divide-border bg-card'>
          <MemberAppealRow appeal={toModerationAppealSummary(resolvedAppeal)} />
        </tbody>
      </table>
    </EntityStoryFrame>
  ),
}

const detailActions = {
  viewerRole: 'administrator',
  disabled: false,
  onEdit: fn(),
  onApprove: fn(),
  onSend: fn(),
  onRerunAI: fn(),
  onResolve: fn(),
} as const

export const Detail: Story = {
  render: () => (
    <EntityStoryFrame title='Appeal Detail (staff)'>
      <AppealDetail
        appeal={pendingAppeal}
        {...detailActions}
      />
    </EntityStoryFrame>
  ),
}

export const DetailDialog: Story = {
  render: () => (
    <AppealDetailDialog
      appeal={pendingAppeal}
      onClose={fn()}
      {...detailActions}
    />
  ),
}
