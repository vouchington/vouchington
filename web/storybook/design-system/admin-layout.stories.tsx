import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Design System/Components/Admin Layout',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ListPageShell: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-4xl space-y-4'>
        <AdminPageHeader
          title='CRM Contacts'
          description='Manage influencer outreach and contact relationships'
        >
          <Button
            size='touchSm'
            variant='outline'
          >
            Import CSV
          </Button>
        </AdminPageHeader>
        <AdminTableShell aria-label='CRM Contacts'>
          <table className='w-full text-sm'>
            <thead className='border-b bg-muted/50'>
              <tr>
                <th className='px-4 py-3 text-left font-medium'>Name</th>
                <th className='px-4 py-3 text-left font-medium'>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className='border-b'>
                <td className='px-4 py-4'>Alex Morgan</td>
                <td className='px-4 py-4 text-muted-foreground'>Active</td>
              </tr>
            </tbody>
          </table>
        </AdminTableShell>
        <AdminPagination
          previousHref='/crm'
          nextHref='/crm?after=cursor'
        />
      </div>
    </main>
  ),
}
