import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddCardForm } from '@/components/my/cards-manager/add-card-form'
import { topics } from '@/storybook/entities/fixtures/topics'
import {
  clearTopicSearchFixture,
  setTopicSearchFixture,
} from '@/storybook/mocks/client-api-instance'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Add Card Form',
  beforeEach() {
    setTopicSearchFixture()
    return () => clearTopicSearchFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sapphire = topics[1]!

export const SelectedCard: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <AddCardForm
        newCardId={sapphire.id}
        newCardLabel={sapphire.name}
        loading={false}
        onCardChange={() => {}}
        onAdd={() => {}}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <AddCardForm
        newCardId={null}
        newCardLabel=''
        loading={false}
        onCardChange={() => {}}
        onAdd={() => {}}
      />
    </StoryFrame>
  ),
}
