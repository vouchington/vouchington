import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const meta = {
  title: 'Design System/Components/Avatar',
  component: Avatar,
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

const avatarDataUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"%3E%3Crect width="80" height="80" fill="%23171717"/%3E%3Ctext x="40" y="47" text-anchor="middle" font-size="22" fill="white" font-family="Arial"%3EVC%3C/text%3E%3C/svg%3E'
const secondAvatarDataUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"%3E%3Crect width="80" height="80" fill="%230f766e"/%3E%3Ctext x="40" y="47" text-anchor="middle" font-size="22" fill="white" font-family="Arial"%3EV2%3C/text%3E%3C/svg%3E'

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-md border p-3'>
      {children}
    </div>
  </main>
)

export const WithImage: Story = {
  render: () => (
    <Frame>
      <Avatar>
        <AvatarImage
          src={avatarDataUrl}
          alt='Voucha contributor'
        />
        <AvatarFallback>VC</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage
          src={secondAvatarDataUrl}
          alt='Voucha contributor 2'
        />
        <AvatarFallback>V2</AvatarFallback>
      </Avatar>
    </Frame>
  ),
}

export const Fallback: Story = {
  render: () => (
    <Frame>
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className='bg-primary text-primary-foreground'>JD</AvatarFallback>
      </Avatar>
    </Frame>
  ),
}

export const Sizes: Story = {
  render: () => (
    <Frame>
      <Avatar className='h-6 w-6'>
        <AvatarFallback className='text-xs'>S</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>M</AvatarFallback>
      </Avatar>
      <Avatar className='h-14 w-14'>
        <AvatarFallback className='text-base'>L</AvatarFallback>
      </Avatar>
      <Avatar className='h-20 w-20'>
        <AvatarFallback className='text-xl'>XL</AvatarFallback>
      </Avatar>
    </Frame>
  ),
}
