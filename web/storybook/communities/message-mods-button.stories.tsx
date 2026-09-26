import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import MessageModsButton from '@/components/communities/message-mods-button'
import { communities } from '@/storybook/entities/fixtures/communities'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Message Mods Button',
  component: MessageModsButton,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof MessageModsButton>

export default meta
type Story = StoryObj<typeof meta>

function CreditCardsMessage() {
  const [href, setHref] = useState<string | null>(null)
  return (
    <StoryFrame width='max-w-xs'>
      {href ? (
        <p>Opened {href}</p>
      ) : (
        <MessageModsButton
          communitySlug={communities[0]!.slug}
          onOpened={setHref}
        />
      )}
    </StoryFrame>
  )
}

export const CreditCards: Story = {
  args: { communitySlug: communities[0]!.slug },
  render: () => <CreditCardsMessage />,
}
