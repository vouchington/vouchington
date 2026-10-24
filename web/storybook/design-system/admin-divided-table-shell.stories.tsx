import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { DividedTableShell, type DividedTableColumn } from '@/components/admin/divided-table-shell'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Design System/Components/Admin Divided Table Shell',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const columns: readonly DividedTableColumn[] = [
  ['term', 'Term'],
  ['category', 'Category'],
  ['status', 'Status'],
]

export const WithRows: Story = {
  render: () => (
    <StoryFrame>
      <DividedTableShell
        aria-label='Blocked terms'
        columns={columns}
        emptyMessage='No blocked terms yet.'
        isEmpty={false}
      >
        <tr>
          <td className='px-4 py-3 text-sm'>guaranteed approval</td>
          <td className='px-4 py-3 text-sm'>Misleading claim</td>
          <td className='px-4 py-3 text-sm'>Active</td>
        </tr>
        <tr>
          <td className='px-4 py-3 text-sm'>free miles</td>
          <td className='px-4 py-3 text-sm'>Spam</td>
          <td className='px-4 py-3 text-sm'>Active</td>
        </tr>
      </DividedTableShell>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('columnheader', { name: 'Category' })).toBeVisible()
    await expect(canvas.getByText('guaranteed approval')).toBeVisible()
    await expect(canvas.queryByText('No blocked terms yet.')).toBeNull()
  },
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <DividedTableShell
        aria-label='Blocked terms'
        columns={columns}
        emptyMessage='No blocked terms yet.'
        isEmpty
      >
        {null}
      </DividedTableShell>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No blocked terms yet.')).toBeVisible()
  },
}
