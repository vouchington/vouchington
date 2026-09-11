import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const meta = {
  title: 'Design System/Components/Textarea',
  component: Textarea,
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

const SubmitOnCmdEnterExample = () => {
  const [submitCount, setSubmitCount] = useState(0)

  return (
    <Frame>
      <form
        className='flex flex-col gap-2'
        onSubmit={event => {
          event.preventDefault()
          setSubmitCount(count => count + 1)
        }}
      >
        <Label htmlFor='textarea-submit'>Reply</Label>
        <Textarea
          id='textarea-submit'
          data-testid='textarea-submit-target'
          placeholder='Reply with Ctrl/Cmd+Enter'
        />
        <p
          className='text-xs text-muted-foreground'
          data-testid='textarea-submit-count'
          aria-live='polite'
        >
          Submits: {submitCount}
        </p>
      </form>
    </Frame>
  )
}

export const Default: Story = {
  render: () => (
    <Frame>
      <Textarea placeholder='Write a message…' />
    </Frame>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Frame>
      <Textarea
        placeholder='Cannot edit'
        disabled
      />
    </Frame>
  ),
}

export const WithLabel: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='textarea-with-label'>Your reply</Label>
        <Textarea
          id='textarea-with-label'
          placeholder='Reply with Cmd+Enter to submit'
        />
        <p className='text-xs text-muted-foreground'>
          Cmd+Enter submits the surrounding form (handled by the Textarea primitive).
        </p>
      </div>
    </Frame>
  ),
}

export const SubmitOnCmdEnter: Story = {
  render: () => <SubmitOnCmdEnterExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = canvas.getByTestId('textarea-submit-target')
    const submitCount = canvas.getByTestId('textarea-submit-count')

    await expect(submitCount).toHaveTextContent('Submits: 0')
    await userEvent.type(textarea, 'Ready to send')
    await expect(textarea).toHaveValue('Ready to send')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await expect(submitCount).toHaveTextContent('Submits: 1')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await expect(submitCount).toHaveTextContent('Submits: 2')
  },
}
