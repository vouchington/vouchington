import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { IdentityProfileImageSection } from '@/components/my/identity-profile-image-section'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'

const meta = {
  title: 'My/Identity Profile Image Section',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const username = storyCurrentUser.username ?? 'cardholder'

export const WithImage: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <IdentityProfileImageSection
        handleImageUploadEnd={() => {}}
        handleImageUploadStart={() => {}}
        handleImageUploaded={async () => {}}
        handleRemoveImage={async () => {}}
        imageLoading={false}
        profileImageId='profile-image-cardholder'
        profileImagePlacement={{
          image_id: 'profile-image-cardholder',
          placement_id: 'placement-cardholder',
          placement_revision: 1,
        }}
        username={username}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('img', { name: username })).toBeVisible()
  },
}

export const NoImage: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <IdentityProfileImageSection
        handleImageUploadEnd={() => {}}
        handleImageUploadStart={() => {}}
        handleImageUploaded={async () => {}}
        handleRemoveImage={async () => {}}
        imageLoading={false}
        profileImageId={null}
        username={username}
      />
    </StoryFrame>
  ),
}
