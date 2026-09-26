import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ResultGroups } from '@/components/command-search/result-groups'
import { Command, CommandList } from '@/components/ui/command'
import { StoryFrame } from '@/storybook/story-frame'
import { pageShortcut, searchResults } from './search-story-data'

const meta = {
  title: 'Command Search/Result Groups',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ResultsPreview({ empty }: { empty?: boolean }) {
  return (
    <StoryFrame width='max-w-xl'>
      <Command
        shouldFilter={false}
        label='Search results'
      >
        {empty ? (
          <output className='block py-6 text-center text-sm'>
            No results for Sapphire Reserve
          </output>
        ) : (
          <CommandList>
            <ResultGroups
              activeTab='all'
              matchedShortcuts={[pageShortcut]}
              results={searchResults}
              onOpenChange={() => {}}
              pushRoute={() => {}}
            />
          </CommandList>
        )}
      </Command>
    </StoryFrame>
  )
}

export const SapphireReserve: Story = {
  render: () => <ResultsPreview />,
}

export const Empty: Story = {
  render: () => <ResultsPreview empty />,
}
