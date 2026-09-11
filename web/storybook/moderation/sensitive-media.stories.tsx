import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent as storybookUserEvent, within } from 'storybook/test'
import { useState } from 'react'

import { SensitiveMedia } from '@/components/moderation/sensitive-media'

const meta = {
  title: 'Moderation/SensitiveMedia',
  component: SensitiveMedia,
  args: { children: null },
} satisfies Meta<typeof SensitiveMedia>

export default meta
type Story = StoryObj<typeof meta>

async function tabToStoryControl(storybookFallbackTarget: HTMLElement) {
  // Remove this split when testing-library/user-event#1215 or storybookjs/storybook#27138
  // makes Storybook's tab simulation respect inert ancestors.
  if ('__vitest_browser__' in globalThis) {
    const { userEvent: browserUserEvent } = await import('vitest/browser')
    await browserUserEvent.tab()
    return
  }

  // The fallback keeps the play function runnable; it does not verify sequential Tab order.
  storybookFallbackTarget.focus()
}

function InteractiveSensitiveMedia() {
  const [activationCount, setActivationCount] = useState(0)

  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-md flex-col gap-4 rounded-md border p-4'>
        <button type='button'>Before sensitive media</button>
        <SensitiveMedia>
          <button
            type='button'
            onClick={() => setActivationCount(count => count + 1)}
            data-testid='sensitive-media-action'
          >
            Open sensitive image
          </button>
        </SensitiveMedia>
        <output data-testid='activation-count'>{activationCount}</output>
      </div>
    </main>
  )
}

export const KeyboardGate: Story = {
  render: () => <InteractiveSensitiveMedia />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const leadingButton = canvas.getByRole('button', { name: 'Before sensitive media' })
    const hiddenAction = canvas.getByTestId('sensitive-media-action')
    const activationCount = canvas.getByTestId('activation-count')

    hiddenAction.focus()
    await expect(hiddenAction).not.toHaveFocus()

    const revealButton = canvas.getByRole('button', { name: /Sensitive content/i })
    leadingButton.focus()
    await tabToStoryControl(revealButton)
    await expect(revealButton).toHaveFocus()
    await storybookUserEvent.keyboard('{Enter}')
    await expect(activationCount).toHaveTextContent('0')

    const revealedAction = canvas.getByRole('button', { name: 'Open sensitive image' })
    leadingButton.focus()
    await tabToStoryControl(revealedAction)
    await expect(revealedAction).toHaveFocus()
    await storybookUserEvent.keyboard('{Enter}')
    await expect(activationCount).toHaveTextContent('1')
  },
}
