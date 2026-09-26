import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CommunityResults,
  DomainResults,
  FediverseResults,
  NewsResults,
} from '@/components/command-search/result-groups-extra'
import { Command, CommandList } from '@/components/ui/command'
import { StoryFrame } from '@/storybook/story-frame'
import { emptySearchResults, searchResults } from './search-story-data'

const meta = {
  title: 'Command Search/Result Groups Extra',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ExtraResults({ empty }: { empty?: boolean }) {
  const results = empty ? emptySearchResults : searchResults
  const groups = (
    <>
      <CommunityResults
        activeTab='all'
        onOpenChange={() => {}}
        pushRoute={() => {}}
        results={results}
      />
      <DomainResults
        activeTab='all'
        onOpenChange={() => {}}
        pushRoute={() => {}}
        results={results}
      />
      <FediverseResults
        activeTab='all'
        onOpenChange={() => {}}
        results={results}
      />
      <NewsResults
        activeTab='all'
        onOpenChange={() => {}}
        results={results}
      />
    </>
  )
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
          <CommandList>{groups}</CommandList>
        )}
      </Command>
    </StoryFrame>
  )
}

export const CardsAndCommunities: Story = {
  render: () => <ExtraResults />,
}

export const Empty: Story = {
  render: () => <ExtraResults empty />,
}
