import { useEffect, useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { PostAutocomplete } from '@/components/posts/post-autocomplete'
import { createAutocompleteFetch } from '@/storybook/design-system/autocomplete-fixtures'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Post Autocomplete',
  component: PostAutocomplete,
} satisfies Meta<typeof PostAutocomplete>

export default meta
type Story = StoryObj<typeof meta>

function SearchPosts(args: ComponentProps<typeof PostAutocomplete>) {
  const [value, setValue] = useState(args.value)
  const [title, setTitle] = useState(args.label)

  useEffect(() => {
    const originalFetch = window.fetch
    const fixtureFetch = createAutocompleteFetch(originalFetch)
    window.fetch = fixtureFetch
    return () => {
      if (window.fetch === fixtureFetch) window.fetch = originalFetch
    }
  }, [])

  return (
    <StoryFrame width='max-w-sm'>
      <PostAutocomplete
        {...args}
        value={value}
        label={title}
        onChange={(id, selectedTitle) => {
          setValue(id)
          setTitle(selectedTitle)
          args.onChange(id, selectedTitle)
        }}
      />
      {value && <p className='mt-3 text-sm'>Selected: {title}</p>}
    </StoryFrame>
  )
}

export const ReviewsAndDiscussions: Story = {
  args: {
    value: null,
    label: '',
    onChange: fn(),
    postTypes: ['review', 'discussion'],
  },
  render: args => <SearchPosts {...args} />,
}
