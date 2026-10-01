import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityAutomodActionForm } from '@/components/communities/community-automod-action-form'
import '@/storybook/mocks/client-api-instance'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { communities } from '@/storybook/entities/fixtures/communities'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Automod Action Form',
  component: CommunityAutomodActionForm,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
  render: args => (
    <StoryFrame>
      <CommunityAutomodActionForm {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof CommunityAutomodActionForm>

export default meta
type Story = StoryObj<typeof meta>

export const RecordOnly: Story = {
  args: { community: { slug: communities[0]!.slug, automod_action: 'record_only' } },
}

export const ReviewQueue: Story = {
  args: { community: { slug: communities[0]!.slug, automod_action: 'review_queue' } },
}

export const Unpublish: Story = {
  args: { community: { slug: communities[0]!.slug, automod_action: 'unpublish' } },
}
