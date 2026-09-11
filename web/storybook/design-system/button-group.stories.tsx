import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'

const meta = {
  title: 'Design System/Components/ButtonGroup',
  component: ButtonGroup,
} satisfies Meta<typeof ButtonGroup>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-6 rounded-md border p-3'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-2'>
        <p className='text-xs text-muted-foreground'>horizontal (default)</p>
        <ButtonGroup>
          <Button
            variant='outline'
            size='touchSm'
          >
            Mute
          </Button>
          <Button
            variant='outline'
            size='touchSm'
          >
            Block
          </Button>
          <Button
            variant='outline'
            size='touchSm'
          >
            <Flag />
            Report
          </Button>
        </ButtonGroup>
      </div>
    </Frame>
  ),
}

export const Vertical: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-2'>
        <p className='text-xs text-muted-foreground'>vertical</p>
        <ButtonGroup
          orientation='vertical'
          className='max-w-xs'
          aria-label='Subscription actions'
        >
          <Button
            variant='outline'
            size='touchSm'
          >
            Subscribe to Posts
          </Button>
          <Button
            variant='outline'
            size='touchSm'
          >
            Subscribe to News
          </Button>
          <Button
            variant='outline'
            size='touchSm'
          >
            Mute
          </Button>
        </ButtonGroup>
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const group = await canvas.findByRole('group', { name: 'Subscription actions' })

    await expect(group).toHaveClass('flex-col')
    await expect(group).toHaveClass('items-stretch')
    const postsButton = await canvas.findByRole('button', { name: 'Subscribe to Posts' })
    const newsButton = await canvas.findByRole('button', { name: 'Subscribe to News' })
    const muteButton = await canvas.findByRole('button', { name: 'Mute' })

    await expect(postsButton).toBeVisible()
    await expect(newsButton).toBeVisible()
    await expect(muteButton).toBeVisible()
  },
}
