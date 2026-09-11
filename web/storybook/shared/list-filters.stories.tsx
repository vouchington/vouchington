import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ListFilters } from '@/components/shared/list-filters'
import { ListFiltersSortSelect } from '@/components/shared/list-filters-sort-select'

const meta = {
  title: 'Shared/ListFilters',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-4 rounded-md border p-4'>{children}</div>
  </main>
)

const sortOptions = [
  { label: 'New', value: 'new', description: 'Sort by most recent' },
  { label: 'Best', value: 'best', description: 'Sort by highest score' },
]

export const Default: Story = {
  render: () => (
    <Frame>
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={sortOptions}
      />
    </Frame>
  ),
}

export const WithChildren: Story = {
  render: () => (
    <Frame>
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={sortOptions}
      >
        <select
          aria-label='Filter by type'
          className='h-11 rounded-md border px-3 text-sm sm:h-9'
        >
          <option value=''>All types</option>
          <option value='card'>Card</option>
          <option value='bank'>Bank</option>
        </select>
      </ListFilters>
    </Frame>
  ),
}

export const SearchOnly: Story = {
  render: () => (
    <Frame>
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={sortOptions}
        showSort={false}
      />
    </Frame>
  ),
}

export const SortOnly: Story = {
  render: () => (
    <Frame>
      <ListFilters
        placeholder='Search topics...'
        defaultSort='new'
        sortOptions={sortOptions}
        showSearch={false}
      />
    </Frame>
  ),
}

function SortSelectStandalone() {
  const [value, setValue] = useState('new')
  return (
    <ListFiltersSortSelect
      value={value}
      options={sortOptions}
      onValueChange={setValue}
    />
  )
}

export const SortSelect: Story = {
  render: () => (
    <Frame>
      <SortSelectStandalone />
    </Frame>
  ),
}
