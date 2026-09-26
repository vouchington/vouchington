import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DisputeForm } from '@/components/disputes/dispute-form'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Disputes/Dispute Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const claimText =
  'The Sapphire Reserve review says the $300 travel credit posts automatically. It only applies after you enroll, and the charge has to code as travel.'

function ReadyForm({ error }: { error: string | null }) {
  const turnstile = useTurnstileToken()
  return (
    <DisputeForm
      submitted={false}
      reason='factually_inaccurate'
      claimText={claimText}
      loading={false}
      error={error}
      turnstile={turnstile}
      onReasonChange={() => {}}
      onClaimTextChange={() => {}}
      onSubmit={event => event.preventDefault()}
      onClose={() => {}}
    />
  )
}

export const Ready: Story = {
  render: () => (
    <StoryFrame>
      <ReadyForm error={null} />
    </StoryFrame>
  ),
}

export const SubmitError: Story = {
  render: () => (
    <StoryFrame>
      <ReadyForm error='This review dispute could not be filed. Sign in as the reviewed business and try again.' />
    </StoryFrame>
  ),
}

function SubmittedForm() {
  const turnstile = useTurnstileToken()
  return (
    <DisputeForm
      submitted
      reason='factually_inaccurate'
      claimText={claimText}
      loading={false}
      error={null}
      turnstile={turnstile}
      onReasonChange={() => {}}
      onClaimTextChange={() => {}}
      onSubmit={event => event.preventDefault()}
      onClose={() => {}}
    />
  )
}

export const Submitted: Story = {
  render: () => (
    <StoryFrame>
      <SubmittedForm />
    </StoryFrame>
  ),
}
