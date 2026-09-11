import { useCallback, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Mail, Star } from 'lucide-react'

import { TooltipButton } from '@/components/ui/_button-tooltip'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Design System/Components/Button',
  component: Button,
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

export const Variants: Story = {
  render: () => (
    <Frame>
      {(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const).map(
        variant => (
          <div
            key={variant}
            className='flex items-center gap-2'
          >
            <span className='w-24 shrink-0 font-mono text-xs text-muted-foreground'>{variant}</span>
            <Button variant={variant}>Button</Button>
          </div>
        ),
      )}
    </Frame>
  ),
}

export const Sizes: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center gap-2'>
        <Button size='sm'>Small</Button>
        <Button size='default'>Default</Button>
        <Button size='lg'>Large</Button>
        <Button size='touch'>Touch</Button>
        <Button size='touchSm'>Touch small</Button>
        <Button
          size='icon'
          aria-label='Favorite'
        >
          <Star />
        </Button>
        <Button
          size='touchIcon'
          aria-label='Touch favorite'
        >
          <Star />
        </Button>
      </div>
    </Frame>
  ),
}

export const WithIcon: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-wrap items-center gap-2'>
        <Button>
          <Mail />
          Email
        </Button>
        <Button variant='outline'>
          <Star />
          Favorite
        </Button>
        <Button variant='secondary'>
          <Mail />
          Subscribe
        </Button>
      </div>
    </Frame>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-wrap items-center gap-2'>
        <Button disabled>Disabled default</Button>
        <Button
          variant='destructive'
          disabled
        >
          Disabled destructive
        </Button>
        <Button
          variant='outline'
          disabled
        >
          Disabled outline
        </Button>
      </div>
    </Frame>
  ),
}

export const AsLink: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-wrap items-center gap-2'>
        <Button asChild>
          <a href='https://example.com'>External link</a>
        </Button>
        <Button
          asChild
          variant='link'
        >
          <a href='https://example.com'>Inline link</a>
        </Button>
      </div>
    </Frame>
  ),
}

export const WithTooltip: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center gap-4'>
        <TooltipButton
          size='icon'
          aria-label='Favorite'
          tooltip='Favorite'
        >
          <Star />
        </TooltipButton>
        <TooltipButton
          size='touchIcon'
          aria-label='Touch favorite'
          tooltip='Touch favorite'
        >
          <Star />
        </TooltipButton>
      </div>
    </Frame>
  ),
}

const ClickInteractionDemo = () => {
  const [clickCount, setClickCount] = useState(0)
  const incrementClickCount = useCallback(() => setClickCount(c => c + 1), [])
  return (
    <Frame>
      <Button
        data-testid='click-target'
        onClick={incrementClickCount}
      >
        Click me
      </Button>
      <span data-testid='click-count'>{clickCount}</span>
    </Frame>
  )
}

export const ClickInteraction: Story = {
  render: () => <ClickInteractionDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByTestId('click-target')
    const count = canvas.getByTestId('click-count')
    await expect(count.textContent).toBe('0')
    await userEvent.click(button)
    await expect(count.textContent).toBe('1')
  },
}
