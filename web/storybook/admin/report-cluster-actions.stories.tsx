import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ReportClusterActions } from '@/components/admin/report-cluster-actions'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Admin/Report Cluster Actions',
  component: ReportClusterActions,
} satisfies Meta<typeof ReportClusterActions>

export default meta
type Story = StoryObj<typeof meta>

export const PendingPosts: Story = {
  args: {
    disabled: false,
    loadingAction: null,
    canRemoveTarget: true,
    hasPendingReports: true,
    isPartialReportSet: false,
    onDismiss: fn(),
    onRemoveTarget: fn(),
    onReview: fn(),
  },
  render: args => (
    <StoryFrame>
      <ReportClusterActions {...args} />
    </StoryFrame>
  ),
}
