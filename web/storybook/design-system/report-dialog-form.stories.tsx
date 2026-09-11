import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReportDialogForm } from '@/components/shared/report-dialog-form'
import type { ReportReason } from '@/lib/api/client/reports'

const noopTurnstile = {
  token: 'storybook-turnstile-token',
  reset: () => {},
  containerRef: (_node: HTMLDivElement | null) => {},
  isError: false,
  alwaysApprove: false,
}

const meta = {
  title: 'Design System/Components/Report Dialog Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ReportDialogFormStory({ inlineError = null }: { inlineError?: string | null }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')

  return (
    <ReportDialogForm
      entityType='post'
      reason={reason}
      onSelectReason={setReason}
      note={note}
      onNoteChange={setNote}
      turnstile={noopTurnstile}
      inlineError={inlineError}
      submitting={false}
      onCancel={() => {}}
      onSubmit={e => e.preventDefault()}
    />
  )
}

export const Default: Story = {
  render: () => <ReportDialogFormStory />,
}

export const WithInlineError: Story = {
  render: () => <ReportDialogFormStory inlineError='Failed to submit report. Please try again.' />,
}
