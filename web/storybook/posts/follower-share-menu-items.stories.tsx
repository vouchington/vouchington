import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FollowerShareMenuItems } from '@/components/posts/follower-share-menu-items'
import { StoryFrame } from '@/storybook/story-frame'
import { OpenPostMenu } from './open-post-menu'

const meta = {
  title: 'Posts/Follower Share Menu Items',
  component: FollowerShareMenuItems,
} satisfies Meta

export default meta
type Story = StoryObj

function ShareMenu() {
  const [isSharePending, setIsSharePending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  return (
    <StoryFrame width='max-w-sm'>
      <OpenPostMenu>
        <FollowerShareMenuItems
          isSharePending={isSharePending}
          onShare={async () => {
            setIsSharePending(true)
            setStatus('Shared with followers')
            setIsSharePending(false)
          }}
          onSendOpen={() => setStatus('Choose followers to notify')}
        />
      </OpenPostMenu>
      {status ? <p className='mt-3 text-sm'>{status}</p> : null}
    </StoryFrame>
  )
}

export const Ready: Story = {
  render: () => <ShareMenu />,
}
