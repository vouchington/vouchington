import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ReportJudgementCounts } from '@/components/moderation/report-judgement-counts'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Moderation/Report Judgement Counts',
  component: ReportJudgementCounts,
} satisfies Meta<typeof ReportJudgementCounts>

export default meta
type Story = StoryObj<typeof meta>

export const ExactCounts: Story = {
  args: {
    judgedReportCount: 20,
    judgedReportCountCapped: false,
    currentReportCount: 22,
    currentReportCountCapped: false,
    uiLocale: 'en',
  },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <ReportJudgementCounts {...args} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('At judgement: 20 reports')).toBeVisible()
    await expect(canvas.getByText('Current reports: 22 reports')).toBeVisible()
  },
}

export const CappedCounts: Story = {
  args: {
    judgedReportCount: 1000,
    judgedReportCountCapped: true,
    currentReportCount: 1000,
    currentReportCountCapped: true,
    uiLocale: 'en',
  },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <ReportJudgementCounts {...args} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('At judgement: 1K+ reports')).toBeVisible()
    await expect(canvas.getByText('Current reports: 1K+ reports')).toBeVisible()
  },
}

export const UnknownHistoricalCount: Story = {
  args: {
    judgedReportCount: null,
    judgedReportCountCapped: false,
    currentReportCount: 1000,
    currentReportCountCapped: true,
    uiLocale: 'en',
  },
  render: args => (
    <StoryFrame width='max-w-xl'>
      <ReportJudgementCounts {...args} />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/At judgement/)).not.toBeInTheDocument()
    await expect(canvas.getByText('Current reports: 1K+ reports')).toBeVisible()
  },
}
