import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ImagesFieldset, type ImageEntry } from '@/components/posts/post-form-images-fieldset'
import { StoryFrame } from '@/storybook/story-frame'

const loungeImages: ImageEntry[] = [
  {
    key: 'lounge',
    image_id: 'image-sapphire-lounge',
    placement_id: 'placement-sapphire-lounge',
    placement_revision: 1,
    order_index: 0,
    caption: 'Centurion lounge before a redeye to Tokyo',
  },
  {
    key: 'card',
    image_id: 'image-sapphire-reserve',
    placement_id: 'placement-sapphire-reserve',
    placement_revision: 1,
    order_index: 1,
    caption: 'Sapphire Reserve used at a sushi counter',
  },
]

const meta = {
  title: 'Posts/Images Fieldset',
  component: ImagesFieldset,
} satisfies Meta

export default meta
type Story = StoryObj

function ImagesStory({ images }: { images: ImageEntry[] }) {
  const [entries, setEntries] = useState(images)
  return (
    <StoryFrame width='max-w-xl'>
      <ImagesFieldset
        images={entries}
        onImageUploaded={imageId => {
          setEntries(current => [
            ...current,
            {
              key: imageId,
              image_id: imageId,
              order_index: current.length,
              caption: '',
            },
          ])
        }}
        setIsUploading={() => {}}
        moveImage={(index, direction) => {
          setEntries(current => {
            const next = [...current]
            const target = index + direction
            const moved = next[target]
            const currentImage = next[index]
            if (!moved || !currentImage) return current
            next[index] = moved
            next[target] = currentImage
            return next.map((image, imageIndex) => ({ ...image, order_index: imageIndex }))
          })
        }}
        updateCaption={(index, caption) => {
          setEntries(current =>
            current.map((image, imageIndex) =>
              imageIndex === index ? { ...image, caption } : image,
            ),
          )
        }}
        removeImage={index => {
          setEntries(current => current.filter((_, imageIndex) => imageIndex !== index))
        }}
      />
    </StoryFrame>
  )
}

export const WithImages: Story = {
  render: () => <ImagesStory images={loungeImages} />,
}

export const Empty: Story = {
  render: () => <ImagesStory images={[]} />,
}
