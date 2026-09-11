import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SearchInput, SearchInputShell } from '@/components/shared/search-input'
import { FILTER_CONTROL_HEIGHT } from '@/components/shared/filter-control-height'

const meta = {
  title: 'Shared/SearchInput',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-xl space-y-6'>{children}</div>
  </main>
)

export const Empty: Story = {
  render: () => (
    <Frame>
      <SearchInput
        placeholder='Search...'
        autoComplete='off'
      />
    </Frame>
  ),
}

export const WithValue: Story = {
  render: function WithValueStory() {
    const [value, setValue] = useState('credit cards')
    return (
      <Frame>
        <SearchInput
          placeholder='Search...'
          value={value}
          onChange={e => setValue(e.target.value)}
          onClearValue={() => setValue('')}
        />
      </Frame>
    )
  },
}

export const Focused: Story = {
  render: function FocusedStory() {
    const [value, setValue] = useState('')
    return (
      <Frame>
        <SearchInput
          placeholder='Type to search...'
          value={value}
          onChange={e => setValue(e.target.value)}
          onClearValue={value ? () => setValue('') : undefined}
        />
      </Frame>
    )
  },
}

export const ShellOnly: Story = {
  render: () => (
    <Frame>
      <SearchInputShell>
        <input
          aria-label='Custom search'
          className={`flex ${FILTER_CONTROL_HEIGHT} w-full rounded-md border-0 bg-transparent px-0 py-2 text-sm shadow-none outline-none focus-visible:ring-0`}
          placeholder='Custom inner input...'
        />
      </SearchInputShell>
    </Frame>
  ),
}
