import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ExposureGatedPostImages } from '@/components/posts/post-detail-images-exposure-gate'
import { StoryFrame } from '@/storybook/story-frame'
import {
  clearExposureStateFixture,
  setExposureStateFixture,
} from '@/storybook/mocks/moderation-exposure-fixture'

const meta = {
  title: 'Posts/Post Detail Images Exposure Gate',
  component: ExposureGatedPostImages,
  beforeEach() {
    setExposureStateFixture()
    return () => clearExposureStateFixture()
  },
} satisfies Meta<typeof ExposureGatedPostImages>

export default meta
type Story = StoryObj<typeof meta>

export const SensitiveImage: Story = {
  args: {
    postId: 'post-review',
    children: <div className='h-48 rounded bg-muted p-6'>Sensitive post image</div>,
  },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <ExposureGatedPostImages {...args} />
    </StoryFrame>
  ),
}
