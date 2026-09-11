import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ChevronDown, LogOut, Settings, Star } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { HideMenuItem } from '@/components/shared/hide-button'
import { SaveMenuItem } from '@/components/shared/save-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const meta = {
  title: 'Design System/Components/DropdownMenu',
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-md items-center justify-center gap-3 rounded-md border p-6'>
        <DropdownMenu
          defaultOpen
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <Button variant='outline'>
              Options
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuItem>
              <Star />
              Favorite
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <HideMenuItem
              entityType='rss_feed_item'
              entityId='storybook-rss-item'
            />
            <SaveMenuItem
              entityType='rss_feed_item'
              entityId='storybook-rss-item'
              initialActive
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </main>
  ),
}
