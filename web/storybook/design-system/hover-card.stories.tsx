import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

const meta = {
  title: 'Design System/Components/HoverCard',
  component: HoverCard,
} satisfies Meta<typeof HoverCard>

export default meta
type Story = StoryObj<typeof meta>

const avatarDataUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"%3E%3Crect width="80" height="80" fill="%23171717"/%3E%3Ctext x="40" y="47" text-anchor="middle" font-size="22" fill="white" font-family="Arial"%3EV%3C/text%3E%3C/svg%3E'

export const UserProfile: Story = {
  render: () => (
    <div className='flex justify-center p-16'>
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant='link'>@voucha</Button>
        </HoverCardTrigger>
        <HoverCardContent className='w-80'>
          <div className='flex justify-between space-x-4'>
            <Avatar>
              <AvatarImage
                src={avatarDataUrl}
                alt='Voucha avatar'
              />
              <AvatarFallback>V</AvatarFallback>
            </Avatar>
            <div className='space-y-1'>
              <h4 className='text-sm font-semibold'>@voucha</h4>
              <p className='text-sm'>A knowledge network where experts vouch for what matters.</p>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  ),
}
