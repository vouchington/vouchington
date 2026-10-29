import { expect, within } from 'storybook/test'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEmailApprovalFields } from '@/components/copyright/copyright-email-approval-fields'
import { CopyrightEmailApprovalTargetFields } from '@/components/copyright/copyright-email-approval-target-fields'
import {
  addCopyrightEmailApprovalTarget,
  createCopyrightEmailApprovalDraft,
} from '@/components/copyright/copyright-email-approval-model'

function ApprovalFields() {
  const [draft, setDraft] = useState(() => createCopyrightEmailApprovalDraft({}))
  return (
    <CopyrightEmailApprovalFields
      draft={draft}
      onChange={setDraft}
    />
  )
}
function MultipleTargets() {
  const [draft, setDraft] = useState(() =>
    addCopyrightEmailApprovalTarget(createCopyrightEmailApprovalDraft({})),
  )
  return (
    <CopyrightEmailApprovalTargetFields
      draft={draft}
      onChange={setDraft}
    />
  )
}
export default { title: 'Copyright/Email Approval Fields' } satisfies Meta
export const StatutoryFields: StoryObj = { render: () => <ApprovalFields /> }
export const RemoveHostedMaterial: StoryObj = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByRole('button', { name: 'Remove hosted image' }),
    ).toHaveLength(2)
  },
  render: () => <MultipleTargets />,
}
