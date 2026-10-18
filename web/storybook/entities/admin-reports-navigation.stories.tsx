import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReportsPagination, ReportsSortSelect } from '@/components/admin/reports-navigation'
import { ReportsTableHeader } from '@/components/admin/reports-table-header'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Admin/Report Navigation',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const StaffNavigation: Story = {
  render: () => (
    <EntityStoryFrame
      title='Staff Report Navigation'
      description='Sort reports and browse both directions while preserving queue filters.'
    >
      <div className='space-y-4'>
        <ReportsSortSelect
          viewerTier='staff'
          sortOrder='severity'
        />
        <ReportsPagination
          pageInfo={{
            has_previous_page: true,
            has_next_page: true,
            start_cursor: 'previous-page',
            end_cursor: 'next-page',
          }}
          currentAfter='current-page'
          statusFilter='pending'
          sortOrder='severity'
          clusterMode='none'
        />
        <table className='min-w-full'>
          <ReportsTableHeader viewerTier='staff' />
        </table>
      </div>
    </EntityStoryFrame>
  ),
}

export const MemberNavigation: Story = {
  render: () => (
    <EntityStoryFrame
      title='Member Report Navigation'
      description='Member sorting and the next-page link.'
    >
      <div className='space-y-4'>
        <ReportsSortSelect
          viewerTier='member'
          sortOrder='created_at_desc'
        />
        <ReportsPagination
          pageInfo={{
            has_previous_page: false,
            has_next_page: true,
            end_cursor: 'next-page',
          }}
          sortOrder='created_at_desc'
        />
        <table className='min-w-full'>
          <ReportsTableHeader viewerTier='member' />
        </table>
      </div>
    </EntityStoryFrame>
  ),
}
