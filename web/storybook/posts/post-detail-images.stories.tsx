import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PostDetailImages } from '@/components/posts/post-detail-images'
import { PostImage } from '@/components/shared/post-image'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Post Detail Images',
  component: PostDetailImages,
} satisfies Meta<typeof PostDetailImages>

export default meta
type Story = StoryObj<typeof meta>

const image = {
  imageId: 'image-sapphire-lounge',
  placementId: 'placement-sapphire-lounge',
  placementRevision: 1,
  caption: 'Sapphire lounge',
}

export const SingleImage: Story = {
  args: { heading: 'Sapphire lounge', postId: 'post-review', images: [image] },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <PostDetailImages {...args} />
    </StoryFrame>
  ),
}

export const MultipleImages: Story = {
  args: {
    heading: 'Sapphire lounge',
    postId: 'post-review',
    images: [
      image,
      { ...image, imageId: 'image-hotel', placementId: 'placement-hotel', caption: 'Hotel room' },
    ],
    thumbnails: [
      <PostImage
        key='lounge'
        imageId='image-sapphire-lounge'
        placement={{ id: 'placement-sapphire-lounge', revision: 1 }}
        width={1200}
        height={600}
        alt='Sapphire lounge'
        className='h-48 w-full rounded-md object-cover'
      />,
      <PostImage
        key='hotel'
        imageId='image-hotel'
        placement={{ id: 'placement-hotel', revision: 1 }}
        width={1200}
        height={600}
        alt='Hotel room'
        className='h-48 w-full rounded-md object-cover'
      />,
    ],
  },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <PostDetailImages {...args} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await Promise.all(
      Array.from(canvasElement.querySelectorAll('img')).map(image => image.decode()),
    )
  },
}
