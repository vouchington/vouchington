import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Command, CommandList } from '@/components/ui/command'
import { CommandLinkItem } from '@/components/command-search/command-link-item'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Command Search/Command Link Item',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ReviewAndNews: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <Command
        shouldFilter={false}
        label='Search results'
      >
        <CommandList>
          <CommandLinkItem
            href='/review/post-review'
            external={false}
            dataPw='search-result-sapphire-review'
            label={{ kind: 'ui-text', text: 'My first year with Sapphire Reserve' }}
            sublabel='Review'
            onOpenChange={() => {}}
            pushRoute={() => {}}
          />
          <CommandLinkItem
            href='https://fintech.example/sapphire-reserve-fee'
            external
            dataPw='search-result-sapphire-news'
            label={{ kind: 'ui-text', text: 'Sapphire Reserve annual fee changes for 2026' }}
            sublabel='Fintech Daily'
            onOpenChange={() => {}}
          />
        </CommandList>
      </Command>
    </StoryFrame>
  ),
}
