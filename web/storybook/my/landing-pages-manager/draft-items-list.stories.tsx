import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DraftItemsList } from '@/components/my/landing-pages-manager/draft-items-list'
import { StoryFrame } from '@/storybook/story-frame'
import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'

const meta = {
  title: 'My/Landing Pages Manager Draft Items',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithItems: Story = {
  render: () => (
    <StoryFrame>
      <DraftItemsList
        draftItems={landingPageWithItems.items}
        moveItem={() => {}}
        removeItem={() => {}}
        moveGroupEntry={() => {}}
        removeGroupEntry={() => {}}
      />
    </StoryFrame>
  ),
}
