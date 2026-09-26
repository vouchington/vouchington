import { useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SearchTabs } from '@/components/command-search/search-tabs'
import { getSearchTabs } from '@/components/command-search-data'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Command Search/Search Tabs',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function TabsPreview({ fediverse }: { fediverse: boolean }) {
  const tabsRef = useRef<HTMLFieldSetElement>(null)
  return (
    <StoryFrame>
      <div className='[&_button]:min-h-6 [&_button]:min-w-6'>
        <SearchTabs
          activeTab='topics'
          onTabChange={() => {}}
          onKeyDown={() => {}}
          tabsRef={tabsRef}
          tabs={getSearchTabs({ fediverse })}
        />
      </div>
    </StoryFrame>
  )
}

export const WithFediverse: Story = {
  render: () => <TabsPreview fediverse />,
}

export const WithoutFediverse: Story = {
  render: () => <TabsPreview fediverse={false} />,
}
