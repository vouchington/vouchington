import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreateTopicIdentityFields } from '@/components/admin/topics/create-topic-identity-fields'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'
import type { useAvailabilityCheck } from '@/hooks/use-availability-check'

type Availability = ReturnType<typeof useAvailabilityCheck>

const noopAvailability = {
  onBlur: () => {},
  reset: () => {},
}

const available: Availability = {
  ...noopAvailability,
  state: { status: 'available', conflict: null },
}

const openBanking = topics[0]!

const takenName: Availability = {
  ...noopAvailability,
  state: {
    status: 'taken',
    conflict: {
      kind: 'topic',
      id: openBanking.id,
      slug: openBanking.slug,
      name: openBanking.name,
      topic_type: openBanking.topic_type,
    },
  },
}

const meta = {
  title: 'Admin/Create Topic Identity Fields',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Available: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CreateTopicIdentityFields
        name='Sapphire Reserve'
        slug='sapphire-reserve'
        onNameChange={() => {}}
        onSlugChange={() => {}}
        nameAvailability={available}
        slugAvailability={available}
      />
    </StoryFrame>
  ),
}

export const NameTaken: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CreateTopicIdentityFields
        name='Open Banking'
        slug='open-banking'
        onNameChange={() => {}}
        onSlugChange={() => {}}
        nameAvailability={takenName}
        slugAvailability={available}
      />
    </StoryFrame>
  ),
}
