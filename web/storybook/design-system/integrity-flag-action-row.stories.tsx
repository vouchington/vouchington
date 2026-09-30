import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  IntegrityFlagResolvedActor,
  IntegrityFlagUnresolvedActions,
} from '@/components/admin/integrity-flag-action-row'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Design System/Components/Integrity Flag Actions',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const onRetryReconciliation = fn()

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='max-w-xl'>{children}</div>
    </main>
  )
}

export const ResolvedActor: Story = {
  render: () => (
    <Frame>
      <IntegrityFlagResolvedActor
        resolvedAt='2026-02-02T12:00:00.000Z'
        resolvedById='admin-1'
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('time')).toHaveAttribute('datetime', '2026-02-02T12:00:00.000Z')
    await expect(canvas.getByRole('link', { name: 'by admin-1' })).toHaveAttribute(
      'href',
      '/user/admin-1',
    )
  },
}

export const ReportUnresolved: Story = {
  render: () => (
    <Frame>
      <IntegrityFlagUnresolvedActions
        domain='report'
        resolution=''
        onResolutionChange={() => undefined}
        actions={<Button type='button'>Resolve</Button>}
        error='Result uncertain'
        reconciliationRequired
        onRetryReconciliation={onRetryReconciliation}
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('combobox', { name: 'Resolution' })).toHaveAttribute(
      'data-pw',
      'report-integrity-resolution-select',
    )
    const reconcile = canvas.getByRole('button', { name: 'Reload result' })
    await expect(reconcile.parentElement).toHaveAttribute(
      'data-pw',
      'report-integrity-flag-reconciliation',
    )
    await userEvent.click(reconcile)
    await expect(onRetryReconciliation).toHaveBeenCalled()
  },
}

export const VoteUnresolved: Story = {
  render: () => (
    <Frame>
      <IntegrityFlagUnresolvedActions
        domain='vote'
        resolution=''
        onResolutionChange={() => undefined}
        actions={<Button type='button'>Resolve</Button>}
        error={undefined}
        reconciliationRequired={false}
        onRetryReconciliation={() => undefined}
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('combobox', { name: 'Resolution' })).not.toHaveAttribute(
      'data-pw',
    )
    await expect(canvas.queryByRole('button', { name: 'Reload result' })).toBeNull()
  },
}
