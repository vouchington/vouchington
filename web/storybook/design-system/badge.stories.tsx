import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import Link from 'next/link'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'

const meta = {
  title: 'Design System/Components/Badge',
  component: Badge,
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-wrap gap-2 rounded-md border p-3'>{children}</div>
  </main>
)

export const Variants: Story = {
  render: () => (
    <Frame>
      <Badge>Default</Badge>
      <Badge variant='secondary'>Secondary</Badge>
      <Badge variant='destructive'>Destructive</Badge>
      <Badge variant='outline'>Outline</Badge>
      <Badge variant='discussion'>Discussion</Badge>
      <Badge variant='review'>Review</Badge>
      <Badge variant='data_point'>Data Point</Badge>
      <Badge variant='topic_recommendation'>Topic</Badge>
      <Badge variant='comment'>Comment</Badge>
      <Badge variant='story'>Story</Badge>
      <Badge variant='article'>Article</Badge>
      <Badge variant='blog_post'>Blog Post</Badge>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const labels = [
      'Default',
      'Secondary',
      'Destructive',
      'Outline',
      'Discussion',
      'Review',
      'Data Point',
      'Topic',
      'Comment',
      'Story',
      'Article',
      'Blog Post',
    ]

    await Promise.all(
      labels.map(label => expect(canvas.getByText(label)).toHaveAttribute('data-slot', 'badge')),
    )
  },
}

export const States: Story = {
  render: () => (
    <Frame>
      <Badge variant='secondary'>Static</Badge>
      <Badge
        variant='secondary'
        className='bg-secondary/80'
      >
        Hover
      </Badge>
      <Badge
        variant='secondary'
        className='ring-1 ring-ring'
      >
        Keyboard focus
      </Badge>
      <Badge
        variant='outline'
        className='ring-1 ring-ring'
      >
        Outline focus
      </Badge>
      <Badge
        variant='secondary'
        asChild
      >
        <Link href='/topic/voucha'>Voucha topic link</Link>
      </Badge>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const linkBadge = canvas.getByRole('link', { name: 'Voucha topic link' })

    await expect(canvas.getByText('Keyboard focus')).toHaveClass('ring-ring')
    await expect(canvas.getByText('Outline focus')).toHaveClass('ring-ring')
    await expect(linkBadge).toHaveAttribute('data-slot', 'badge')
    await expect(linkBadge).toHaveAttribute('href', '/topic/voucha')
  },
}
