import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEmailCorrespondenceActions } from '@/components/copyright/copyright-email-correspondence-actions'
import { CopyrightEmailNoticeAssociation } from '@/components/copyright/copyright-email-notice-association'
import { createCopyrightEmailCorrespondenceDraft } from '@/components/copyright/copyright-email-correspondence-model'
import { makeMatchedCopyrightEmailIntake } from '@/test-helpers/components/copyright/copyright-email-review'

export default { title: 'Copyright/Email Correspondence Actions' } satisfies Meta
export const MatchedReply: StoryObj = {
  render: () => (
    <CopyrightEmailCorrespondenceActions
      detail={makeMatchedCopyrightEmailIntake()}
      draft={createCopyrightEmailCorrespondenceDraft()}
      loading={false}
      onAdmit={() => undefined}
      onChange={() => undefined}
      onReject={() => undefined}
      rationale='Reviewed the preserved reply.'
      requiresFallback={false}
    />
  ),
}
export const UnmatchedReply: StoryObj = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Associate with existing notice' }),
    ).toBeDisabled()
  },
  render: () => (
    <CopyrightEmailNoticeAssociation
      loading={false}
      onAssociateWithNotice={() => undefined}
    />
  ),
}
