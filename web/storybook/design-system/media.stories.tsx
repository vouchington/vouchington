import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserAvatar } from '@/components/shared/user-avatar'
import { TopicLogo } from '@/components/shared/topic-logo'
import { PostImage } from '@/components/shared/post-image'

const meta = {
  title: 'Design System/Media',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-wrap items-center gap-4 rounded-md border p-4'>
      {children}
    </div>
  </main>
)

export const UserAvatarDefault: Story = {
  render: () => (
    <Frame>
      <UserAvatar
        profileImageId={null}
        username='alex'
      />
      <UserAvatar
        profileImageId='fixture-profile-image'
        username='cardholder'
        size='lg'
      />
    </Frame>
  ),
}

export const TopicLogoDefault: Story = {
  render: () => (
    <Frame>
      <TopicLogo
        imageId='fixture-topic-logo'
        name='Travel Rewards'
      />
    </Frame>
  ),
}

export const PostImageDefault: Story = {
  render: () => (
    <Frame>
      <PostImage
        imageId='fixture-post-image'
        width={320}
        height={180}
        alt='Fixture post image'
        className='rounded-md object-cover'
      />
    </Frame>
  ),
}
