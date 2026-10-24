import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TypeAttributesSection } from '@/components/topics/settings/type-attributes-section'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Topics/Type Attributes Section',
  component: TypeAttributesSection,
} satisfies Meta<typeof TypeAttributesSection>

export default meta
type Story = StoryObj<typeof meta>

export const Card: Story = {
  args: {
    topicId: 'topic-card',
    currentTopicType: 'card',
    typeAttributes: { annual_fee: { amount: 79500, currency: 'usd' } },
    typeAttributeNames: {},
    typeAttrSaving: false,
    onTypeAttrSubmit: () => {},
  },
  render: args => (
    <StoryFrame>
      <TypeAttributesSection {...args} />
    </StoryFrame>
  ),
}
