import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ImageSection } from '@/components/topics/settings/image-section'
import {
  clearImageUploadFixture,
  setImageUploadFixture,
} from '@/storybook/mocks/image-upload-fixture'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics[0]!

const meta = {
  title: 'Topics/Image',
  beforeEach() {
    setStoryMutationFixture()
    setImageUploadFixture()
    return () => {
      clearStoryMutationFixture()
      clearImageUploadFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const NoImages: Story = {
  render: () => (
    <StoryFrame>
      <ImageSection
        topic={topic}
        heroSaving={false}
        logoSaving={false}
        onHeroRemoved={() => undefined}
        onHeroUploaded={() => undefined}
        onLogoRemoved={() => undefined}
        onLogoUploaded={() => undefined}
        setHeroSaving={() => undefined}
        setLogoSaving={() => undefined}
      />
    </StoryFrame>
  ),
}

export const Uploading: Story = {
  render: () => (
    <StoryFrame>
      <ImageSection
        topic={topics[1]!}
        heroSaving
        logoSaving
        onHeroRemoved={() => undefined}
        onHeroUploaded={() => undefined}
        onLogoRemoved={() => undefined}
        onLogoUploaded={() => undefined}
        setHeroSaving={() => undefined}
        setLogoSaving={() => undefined}
      />
    </StoryFrame>
  ),
}
