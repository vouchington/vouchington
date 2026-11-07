import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FlatReportsClient } from '@/components/admin/flat-reports-client'
import type { StaffFlatModerationReportsResponse } from '@/lib/api/client/reports'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Admin/Flat Reports',
  component: FlatReportsClient,
} satisfies Meta<typeof FlatReportsClient>

export default meta
type Story = StoryObj<typeof meta>

const emptyStaffReports: StaffFlatModerationReportsResponse = {
  results: [],
  page_info: {
    has_next_page: false,
    has_previous_page: false,
    start_cursor: null,
    end_cursor: null,
  },
}

export const Empty: Story = {
  args: {
    viewerTier: 'staff',
    data: emptyStaffReports,
    canBulkRemove: false,
  },
  render: args => (
    <StoryFrame>
      <FlatReportsClient {...args} />
    </StoryFrame>
  ),
}
