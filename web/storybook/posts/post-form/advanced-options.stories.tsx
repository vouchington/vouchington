import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdvancedOptions } from '@/components/posts/post-form/advanced-options'
import type { Post, PostBroadcast, PostPrivacy } from '@/types/posts'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewPost } from '../fixtures'

const meta = {
  title: 'Posts/Advanced Options',
  component: AdvancedOptions,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

function AdvancedOptionsStory({
  post,
  initialBroadcast,
  initialPrivacy,
}: {
  post?: Post
  initialBroadcast: PostBroadcast
  initialPrivacy: PostPrivacy
}) {
  const [broadcast, setBroadcast] = useState(initialBroadcast)
  const [privacy, setPrivacy] = useState(initialPrivacy)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [language, setLanguage] = useState<string | null>('en')
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(true)
  return (
    <StoryFrame width='max-w-lg'>
      <AdvancedOptions
        broadcast={broadcast}
        isAdvancedOpen={isAdvancedOpen}
        isAnonymous={isAnonymous}
        language={language}
        isCommunityPost={false}
        isPrivateCommunityPost={false}
        post={post}
        privacy={privacy}
        setBroadcast={setBroadcast}
        setIsAdvancedOpen={setIsAdvancedOpen}
        setIsAnonymous={setIsAnonymous}
        setLanguage={setLanguage}
        setPrivacy={setPrivacy}
      />
    </StoryFrame>
  )
}

export const NewPost: Story = {
  render: () => (
    <AdvancedOptionsStory
      initialBroadcast='followers'
      initialPrivacy='public'
    />
  ),
}

export const EditPost: Story = {
  render: () => (
    <AdvancedOptionsStory
      post={reviewPost}
      initialBroadcast={reviewPost.broadcast}
      initialPrivacy={reviewPost.privacy}
    />
  ),
}
