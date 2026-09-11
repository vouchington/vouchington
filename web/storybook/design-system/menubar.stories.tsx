// guardrails-disable-file unique-exports
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { EntityMenubarNav } from '@/components/shared/entity-menubar-nav'

const meta = {
  title: 'Design System/Components/Menubar',
  component: Menubar,
} satisfies Meta<typeof Menubar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <main className='flex min-h-screen flex-col gap-6 bg-background p-6 text-foreground'>
      <Menubar
        aria-label='Example menubar'
        className='w-full max-w-md justify-start'
      >
        <MenubarMenu>
          <MenubarTrigger
            asChild
            data-active='true'
            className='data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
          >
            <Link href='/storybook'>Overview</Link>
          </MenubarTrigger>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger className='gap-1'>
            Manage Tags
            <ChevronDown />
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem asChild>
              <Link href='/storybook'>Category Topics</Link>
            </MenubarItem>
            <MenubarItem asChild>
              <Link href='/storybook'>Related Posts</Link>
            </MenubarItem>
            <MenubarItem asChild>
              <Link href='/storybook'>Related Links</Link>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <EntityMenubarNav
        ariaLabel='Entity menubar example'
        className='max-w-md'
        items={[
          {
            key: 'comments',
            active: true,
            content: (
              <Link
                href='/storybook'
                data-pw='entity-menubar-story-comments'
              >
                Comments
              </Link>
            ),
          },
        ]}
      />
    </main>
  ),
}
