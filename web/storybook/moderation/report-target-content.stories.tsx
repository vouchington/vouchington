import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ReportTargetContent } from '@/components/moderation/report-target-content'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Moderation/Report Target Content',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PostText: Story = {
  render: () => (
    <StoryFrame>
      <p>
        <ReportTargetContent
          fallback='Content unavailable'
          targetContent={{
            kind: 'post',
            text: 'Earn 5x on flights with this limited-time referral link.',
            declared_language: 'en',
            lingua_rs_detected_language: 'en',
          }}
        />
      </p>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Earn 5x on flights with this limited-time referral link.'),
    ).toBeVisible()
  },
}

export const CommentText: Story = {
  render: () => (
    <StoryFrame>
      <p>
        <ReportTargetContent
          fallback='Content unavailable'
          targetContent={{
            kind: 'comment',
            text: 'The restaurant category still earns 3x on my card.',
            declared_language: 'en',
            lingua_rs_detected_language: null,
          }}
        />
      </p>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('The restaurant category still earns 3x on my card.'),
    ).toBeVisible()
  },
}

export const Removed: Story = {
  render: () => (
    <StoryFrame>
      <p>
        <ReportTargetContent
          fallback='Content unavailable'
          targetContent={null}
        />
      </p>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Content unavailable')).toBeVisible()
  },
}
