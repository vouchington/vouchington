import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CopyrightAppealForm,
  TargetScopeSelector,
} from '@/components/copyright/copyright-appeal-form'
import { CopyrightCounterNoticeForm } from '@/components/copyright/copyright-response-forms'
import { CopyrightGuestFilingForm } from '@/components/copyright/copyright-guest-filing-form'
import { CopyrightNoticeTargetPicker } from '@/components/copyright/copyright-notice-target-picker'

export default { title: 'Copyright/Response Forms' } satisfies Meta
export const Appeal: StoryObj = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Submit appeal' }),
    ).toBeDisabled()
  },
  render: () => (
    <CopyrightAppealForm
      noticeId='notice-1'
      targetIds={['target-1']}
    />
  ),
}
export const CounterNotice: StoryObj = {
  render: () => (
    <CopyrightCounterNoticeForm
      noticeId='notice-1'
      targetIds={['target-1']}
    />
  ),
}
export const GuestFiling: StoryObj = {
  render: () => <CopyrightGuestFilingForm noticeId='notice-1' />,
}
export const SelectedMaterial: StoryObj = {
  render: () => (
    <TargetScopeSelector
      targetIds={['target-1', 'target-2']}
      selectedTargetIds={['target-1']}
      onChange={() => undefined}
    />
  ),
}
export const FindHostedMaterial: StoryObj = {
  render: () => (
    <CopyrightNoticeTargetPicker
      targets={[]}
      onChange={() => undefined}
    />
  ),
}
