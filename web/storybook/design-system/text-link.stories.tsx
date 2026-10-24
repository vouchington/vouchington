import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import * as React from 'react'

import { TextLink } from '@/components/ui/text-link'

const meta = {
  title: 'Design System/Components/TextLink',
  component: TextLink,
  args: {
    href: '/communities',
  },
} satisfies Meta<typeof TextLink>

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
      <TextLink
        href='/communities'
        className='text-sm underline'
      >
        In-app path
      </TextLink>
      <TextLink
        href='mailto:support@voucha.ai'
        className='text-sm underline'
      >
        Mail link
      </TextLink>
      <TextLink
        href='/exports/export.zip'
        download='export.zip'
        className='text-sm underline'
      >
        Download link
      </TextLink>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const links = canvas.getAllByRole('link')
    await expect(links).toHaveLength(3)
    await expect(links[0]).toHaveAttribute('href', '/communities')
    await expect(links[0]).not.toHaveAttribute('target')
    await expect(links[1]).toHaveAttribute('href', 'mailto:support@voucha.ai')
    await expect(links[2]).toHaveAttribute('download', 'export.zip')
    await expect(links[2]).toHaveAttribute('data-pw', 'text-link-anchor')
  },
}

export const CallerTestId: Story = {
  render: () => (
    <Frame>
      <TextLink
        data-pw='story-text-link'
        href='/communities'
      >
        Caller supplied test id
      </TextLink>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link')).toHaveAttribute('data-pw', 'story-text-link')
  },
}
