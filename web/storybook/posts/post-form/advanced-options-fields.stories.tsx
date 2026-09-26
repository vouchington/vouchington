import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  AudienceField,
  VisibilityField,
} from '@/components/posts/post-form/advanced-options-fields'
import type { PostBroadcast, PostPrivacy } from '@/types/posts'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Audience Field',
  component: AudienceField,
} satisfies Meta

export default meta
type Story = StoryObj

function AudienceStory({
  initialBroadcast,
  initialPrivacy,
  isCommunityPost,
  isPrivateCommunityPost,
}: {
  initialBroadcast: PostBroadcast
  initialPrivacy: PostPrivacy
  isCommunityPost: boolean
  isPrivateCommunityPost: boolean
}) {
  const [broadcast, setBroadcast] = useState(initialBroadcast)
  const [privacy, setPrivacy] = useState(initialPrivacy)
  return (
    <StoryFrame width='max-w-sm'>
      <div className='space-y-4'>
        <AudienceField
          broadcast={broadcast}
          isCommunityPost={isCommunityPost}
          isPrivateCommunityPost={isPrivateCommunityPost}
          setBroadcast={setBroadcast}
          setPrivacy={setPrivacy}
        />
        <VisibilityField
          isCommunityPost={isCommunityPost}
          privacy={privacy}
          setPrivacy={setPrivacy}
        />
      </div>
    </StoryFrame>
  )
}

export const Followers: Story = {
  render: () => (
    <AudienceStory
      initialBroadcast='followers'
      initialPrivacy='public'
      isCommunityPost={false}
      isPrivateCommunityPost={false}
    />
  ),
}

export const PrivateCommunity: Story = {
  render: () => (
    <AudienceStory
      initialBroadcast='users'
      initialPrivacy='private'
      isCommunityPost
      isPrivateCommunityPost
    />
  ),
}
