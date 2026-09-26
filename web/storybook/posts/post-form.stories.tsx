import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostForm } from '@/components/posts/post-form'
import {
  clearTopicSearchFixture,
  setTopicSearchFixture,
} from '@/storybook/mocks/client-api-instance'
import {
  clearImageUploadFixture,
  setImageUploadFixture,
} from '@/storybook/mocks/image-upload-fixture'
import {
  clearSlugAvailabilityFixture,
  setSlugAvailabilityFixture,
} from '@/storybook/mocks/slug-availability-fixture'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { administrator, communityOptions, discussionCategories, reviewWithBody } from './fixtures'

const meta = {
  title: 'Posts/Post Form',
  component: PostForm,
  beforeEach() {
    setStoryMutationFixture()
    setSlugAvailabilityFixture()
    setTopicSearchFixture()
    setImageUploadFixture()
    return () => {
      clearStoryMutationFixture()
      clearSlugAvailabilityFixture()
      clearTopicSearchFixture()
      clearImageUploadFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj

function FormPreview(props: ComponentProps<typeof PostForm>) {
  const [href, setHref] = useState<string | null>(null)
  return (
    <StoryFrame width='max-w-2xl'>
      {href ? (
        <p>{href}</p>
      ) : (
        <PostForm
          {...props}
          onSubmitted={setHref}
        />
      )}
    </StoryFrame>
  )
}

export const NewDiscussion: Story = {
  render: () => (
    <FormPreview
      postType='discussion'
      communityOptions={communityOptions}
      initialCommunitySlug={communityOptions[0]?.slug}
      initialDiscussionCategories={discussionCategories}
      initialRelatedUrls={[
        {
          id: 'url-restaurants',
          url: 'https://www.chase.com/personal/credit-cards/sapphire-reserve',
        },
      ]}
    />
  ),
}

export const EditReview: Story = {
  parameters: { auth: { currentUser: administrator } },
  render: () => (
    <FormPreview
      postType='review'
      post={reviewWithBody}
      isAdmin
      initialRelatedUrls={[
        {
          id: 'url-sapphire',
          url: 'https://www.chase.com/personal/credit-cards/sapphire-reserve',
        },
      ]}
    />
  ),
}
