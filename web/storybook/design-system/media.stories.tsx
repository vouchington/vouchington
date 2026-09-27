import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UserAvatar } from '@/components/shared/user-avatar'
import { TopicLogo } from '@/components/shared/topic-logo'
import { PostImage } from '@/components/shared/post-image'
import { UploadImagePreview } from '@/components/shared/upload-image-preview'

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
      <UserAvatar username='alex' />
      <UserAvatar
        profileImagePlacement={{
          placement_id: '00000000-0000-7000-8000-000000000001',
          placement_revision: 0,
          image_id: '00000000-0000-7000-8000-000000000002',
        }}
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
        placement={{
          placement_id: '00000000-0000-7000-8000-000000000003',
          placement_revision: 0,
          image_id: '00000000-0000-7000-8000-000000000004',
        }}
        name='Travel Rewards'
      />
    </Frame>
  ),
}

export const PostImageDefault: Story = {
  render: () => (
    <Frame>
      <PostImage
        imageId='00000000-0000-7000-8000-000000000006'
        placement={{ id: '00000000-0000-7000-8000-000000000005', revision: 0 }}
        width={320}
        height={180}
        alt='Fixture post image'
        className='rounded-md object-cover'
      />
    </Frame>
  ),
}

export const SelectedUploadPreview: Story = {
  render: () => {
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVXkAAAAASUVORK5CYII=',
      ),
      character => character.codePointAt(0)!,
    )
    return (
      <Frame>
        <UploadImagePreview
          file={new File([bytes], 'selected.png', { type: 'image/png' })}
          alt='Selected upload'
          className='h-16 w-16 object-cover'
        />
      </Frame>
    )
  },
}
