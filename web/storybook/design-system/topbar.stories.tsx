import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import Link from 'next/link'

import { NavbarSearchButton, NavbarWriteButton } from '@/components/navbar/topbar-actions'
import { VouchaLogo } from '@/components/brand/voucha-logo'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Design System/Topbar',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function TopbarFrame({
  authenticated,
  widthClassName,
}: {
  authenticated: boolean
  widthClassName: string
}) {
  return (
    <div className='bg-muted p-4 text-foreground'>
      <div className={widthClassName}>
        <nav
          aria-label='Topbar preview'
          className='flex h-12 items-center border-b bg-background px-4'
        >
          <div className='flex min-w-0 flex-1 items-center gap-2'>
            <Link
              prefetch={false}
              href='/'
              className='flex min-h-11 shrink-0 items-center'
              aria-label='Voucha home'
            >
              <VouchaLogo className='h-6 w-auto' />
            </Link>
            <div className='flex min-w-0 flex-1 items-center justify-end gap-2'>
              <NavbarSearchButton onOpenSearch={() => undefined} />
              {authenticated ? (
                <NavbarWriteButton onOpenWrite={() => undefined} />
              ) : (
                <Button
                  variant='ghost'
                  size='touchSm'
                  asChild
                >
                  <Link
                    href='/login'
                    prefetch={false}
                  >
                    Sign In
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}

export const SignedOutResponsive: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <TopbarFrame
        authenticated={false}
        widthClassName='w-[375px]'
      />
      <TopbarFrame
        authenticated={false}
        widthClassName='w-full'
      />
    </div>
  ),
}

export const SignedInResponsive: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <TopbarFrame
        authenticated
        widthClassName='w-[375px]'
      />
      <TopbarFrame
        authenticated
        widthClassName='w-full'
      />
    </div>
  ),
}
