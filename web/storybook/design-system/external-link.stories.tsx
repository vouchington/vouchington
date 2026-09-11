import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import * as React from 'react'

import { ExternalLink } from '@/components/ui/external-link'

const meta = {
  title: 'Design System/Components/ExternalLink',
  component: ExternalLink,
  args: {
    href: 'https://example.com',
  },
} satisfies Meta<typeof ExternalLink>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-4 rounded-md border p-4'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <ExternalLink href='https://www.walmart.com/plus/refer/abc123'>
        https://www.walmart.com/plus/refer/abc123
      </ExternalLink>
      <ExternalLink
        href='https://www.example.com'
        ugc
      >
        User-generated link (ugc rel)
      </ExternalLink>
      <ExternalLink
        href='https://www.example.com'
        className='truncate text-sm font-medium'
      >
        With custom className
      </ExternalLink>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const links = canvas.getAllByRole('link')
    await expect(links.length).toBeGreaterThan(0)
    await expect(links[0]).toHaveAttribute('target', '_blank')
    await expect(links[0]).toHaveAttribute('rel', 'nofollow noopener noreferrer')
    await expect(links[0]).toHaveAttribute('data-pw', 'external-link')
  },
}

export const UnsafeProtocol: Story = {
  render: () => (
    <Frame>
      <ExternalLink href='javascript:alert(1)'>
        This renders as a non-clickable span (unsafe protocol)
      </ExternalLink>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()
    const span = canvas.getByText('This renders as a non-clickable span (unsafe protocol)')
    await expect(span.tagName).toBe('SPAN')
  },
}
