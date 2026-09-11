import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { AlertTriangle, Info } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const meta = {
  title: 'Design System/Components/Alert',
  component: Alert,
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-2xl flex-col gap-3'>{children}</div>
  </main>
)

export const Variants: Story = {
  render: () => (
    <Frame>
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>
          This is the default alert variant. Use it for neutral notices.
        </AlertDescription>
      </Alert>
      <Alert variant='destructive'>
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          The destructive variant signals a blocking error or failure.
        </AlertDescription>
      </Alert>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const alerts = canvas.getAllByRole('alert')

    await expect(alerts).toHaveLength(2)

    const defaultAlertElement = alerts[0]!
    const destructiveAlertElement = alerts[1]!
    const defaultAlert = within(defaultAlertElement)
    const destructiveAlert = within(destructiveAlertElement)
    const defaultTitle = defaultAlert.getByText('Heads up')
    const defaultDescription = defaultAlert.getByText(
      'This is the default alert variant. Use it for neutral notices.',
    )

    await expect(defaultAlertElement).toHaveAttribute('data-pw', 'alert')
    await expect(defaultTitle).toHaveAttribute('data-pw', 'alert-title')
    await expect(defaultDescription).toHaveAttribute('data-pw', 'alert-description')
    await expect(destructiveAlertElement).toHaveAttribute('data-pw', 'alert')
    await expect(destructiveAlertElement).toHaveClass('text-destructive')
    await expect(destructiveAlert.getByText('Something went wrong')).toHaveAttribute(
      'data-pw',
      'alert-title',
    )
  },
}

export const WithIcon: Story = {
  render: () => (
    <Frame>
      <Alert>
        <Info />
        <AlertTitle>Tip</AlertTitle>
        <AlertDescription>
          Icons render to the left of the title via the alert variant svg selectors.
        </AlertDescription>
      </Alert>
      <Alert variant='destructive'>
        <AlertTriangle />
        <AlertTitle>Action required</AlertTitle>
        <AlertDescription>Verify your email before continuing.</AlertDescription>
      </Alert>
    </Frame>
  ),
}
