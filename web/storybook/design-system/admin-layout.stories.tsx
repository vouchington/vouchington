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
          title='Admin records'
          description='Review staff-managed records'
        >
          <Button
            size='touchSm'
            variant='outline'
          >
            Refresh
          </Button>
        </AdminPageHeader>
        <AdminTableShell aria-label='Admin records'>
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
          previousHref='/urls'
          nextHref='/urls?after=cursor'
        />
      </div>
    </main>
  ),
}
