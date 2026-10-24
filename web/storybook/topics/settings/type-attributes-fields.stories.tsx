import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CardFields } from '@/components/topics/settings/type-attributes-card-fields'
import { AttributeFields } from '@/components/topics/settings/type-attributes-section-fields'
import type { TopicIdField } from '@/components/topics/settings/topic-edit-model'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Topics/Type Attribute Fields',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const shared = {
  typeAttributes: { annual_fee: { amount: 79_500, currency: 'usd' } },
  getValue: (_field: TopicIdField) => null,
  names: {},
  setId: (_field: TopicIdField) => (_id: string) => undefined,
  disabled: false,
  annualFeeError: null,
  onAnnualFeeChange: () => undefined,
} as const

export const Card: Story = {
  render: () => (
    <StoryFrame>
      <form>
        <CardFields {...shared} />
      </form>
    </StoryFrame>
  ),
}

export const CardInAttributeSection: Story = {
  render: () => (
    <StoryFrame>
      <form>
        <AttributeFields
          {...shared}
          currentTopicType='card'
        />
      </form>
    </StoryFrame>
  ),
}
