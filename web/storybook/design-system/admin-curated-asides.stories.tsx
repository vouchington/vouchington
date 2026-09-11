import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CuratedAsideAddForm } from '@/components/admin/curated-asides/curated-aside-add-form'
import { CuratedItemsTable } from '@/components/admin/curated-asides/curated-items-table'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import type { CuratedAsideItem } from '@/types/api-responses/curated-aside-items'

const meta = {
  title: 'Design System/Components/Admin Curated Asides',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const mockItems: CuratedAsideItem[] = [
  {
    id: '019c64e6-f8a0-7000-a000-000000000001',
    aside_type: 'topic',
    entity_id: '019c64e6-f8a0-7000-b000-000000000001',
    position: 0,
    created_by_id: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-01-01T00:00:00.000Z',
    entity_data: {
      entity_type: 'topic',
      id: '019c64e6-f8a0-7000-b000-000000000001',
      name: 'Premium Travel Cards',
      slug: 'premium-travel-cards',
      topic_type: 'topic',
    },
  },
  {
    id: '019c64e6-f8a0-7000-a000-000000000002',
    aside_type: 'topic',
    entity_id: '019c64e6-f8a0-7000-b000-000000000002',
    position: 1,
    created_by_id: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-01-02T00:00:00.000Z',
    entity_data: {
      entity_type: 'topic',
      id: '019c64e6-f8a0-7000-b000-000000000002',
      name: 'Transfer Bonuses',
      slug: 'transfer-bonuses',
      topic_type: 'topic',
    },
  },
  {
    id: '019c64e6-f8a0-7000-a000-000000000003',
    aside_type: 'topic',
    entity_id: '019c64e6-f8a0-7000-b000-000000000003',
    position: 2,
    created_by_id: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-01-03T00:00:00.000Z',
    entity_data: {
      entity_type: 'topic',
      id: '019c64e6-f8a0-7000-b000-000000000003',
      name: 'Airport Lounges',
      slug: 'airport-lounges',
      topic_type: 'topic',
    },
  },
]

const noop = async () => {}

export const TableWithItems: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-4xl space-y-4'>
        <AdminPageHeader
          title='Curated Topics'
          description='Manage curated topic aside items'
        />
        <CuratedAsideAddForm
          asideType='topic'
          onAdd={noop}
        />
        <CuratedItemsTable
          items={mockItems}
          onDelete={noop}
          onReorder={noop}
        />
      </div>
    </main>
  ),
}

export const EmptyTable: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-4xl space-y-4'>
        <AdminPageHeader
          title='Curated Sources'
          description='Manage curated source aside items'
        />
        <CuratedAsideAddForm
          asideType='source'
          onAdd={noop}
        />
        <CuratedItemsTable
          items={[]}
          onDelete={noop}
          onReorder={noop}
        />
      </div>
    </main>
  ),
}
