import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityPostTypeSettingsForm } from '@/components/communities/community-post-type-settings-form'
import { communities } from '@/storybook/entities/fixtures/communities'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Post Type Settings Form',
  component: CommunityPostTypeSettingsForm,
  render: args => (
    <StoryFrame width='max-w-xl'>
      <CommunityPostTypeSettingsForm {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof CommunityPostTypeSettingsForm>

export default meta
type Story = StoryObj<typeof meta>

export const AllPostTypes: Story = {
  args: {
    community: {
      slug: communities[0]!.slug,
      should_allow_review_posts: true,
      should_allow_data_point_posts: true,
    },
  },
}

export const DiscussionsOnly: Story = {
  args: {
    community: {
      slug: communities[0]!.slug,
      should_allow_review_posts: false,
      should_allow_data_point_posts: false,
    },
  },
}
