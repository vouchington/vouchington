import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { UnlinkValidationButton } from '@/components/referral-links/validations/unlink-validation-button'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const referralProgram = topics.find(topic => topic.topic_type === 'referral_program')!

const meta = {
  title: 'Referral Links/Unlink Validation Button',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function UnlinkStory() {
  return (
    <StoryFrame>
      <UnlinkValidationButton
        referralProgramId={referralProgram.id}
        validationId='validation-chase-sapphire'
        slug='chase-sapphire-reserve'
      />
    </StoryFrame>
  )
}

export const Idle: Story = {
  render: () => <UnlinkStory />,
}

export const Confirming: Story = {
  render: () => <UnlinkStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Unlink' }))
    await expect(
      await within(document.body).findByRole('alertdialog', { name: 'Unlink validation?' }),
    ).toBeVisible()
  },
}
