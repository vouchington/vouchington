import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import {
  CopyrightStaffLegalHoldTargetSelector,
  CopyrightStaffProceedingFields,
  type LegalHoldProceedingKind,
} from '@/components/copyright/copyright-staff-legal-hold-fields'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'

const { targets } = makeBusyUsStaffCase()

function LegalHoldAssessmentForm({ initialKind }: { initialKind: LegalHoldProceedingKind }) {
  const [proceedingKind, setProceedingKind] = useState(initialKind)
  const [ccbClaimKind, setCcbClaimKind] = useState<'claim' | 'counterclaim'>('claim')
  const [commencedAt, setCommencedAt] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [fromOriginalClaimant, setFromOriginalClaimant] = useState(false)
  const [sameMaterial, setSameMaterial] = useState(false)
  const [selectedTargetIds, setSelectedTargetIds] = useState(targets.map(target => target.id))
  return (
    <div className='space-y-2 rounded border p-3'>
      <CopyrightStaffProceedingFields
        ccbClaimKind={ccbClaimKind}
        commencedAt={commencedAt}
        fromOriginalClaimant={fromOriginalClaimant}
        proceedingKind={proceedingKind}
        receivedAt={receivedAt}
        sameMaterial={sameMaterial}
        setCcbClaimKind={setCcbClaimKind}
        setCommencedAt={setCommencedAt}
        setFromOriginalClaimant={setFromOriginalClaimant}
        setProceedingKind={setProceedingKind}
        setReceivedAt={setReceivedAt}
        setSameMaterial={setSameMaterial}
      />
      <CopyrightStaffLegalHoldTargetSelector
        holdId='hold-1'
        selectedTargetIds={selectedTargetIds}
        setSelectedTargetIds={setSelectedTargetIds}
        targets={targets}
      />
    </div>
  )
}

const meta = {
  title: 'Copyright/Staff Legal Hold Fields',
  component: LegalHoldAssessmentForm,
  args: { initialKind: 'none' },
} satisfies Meta<typeof LegalHoldAssessmentForm>

export default meta
type Story = StoryObj<typeof meta>

export const NoProceeding: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Material covered by this filing')).toBeVisible()
    const second = canvas.getByRole('checkbox', { name: /Target 2/ })
    await expect(second).toBeChecked()
    await userEvent.click(second)
    await expect(second).not.toBeChecked()
  },
}

export const FederalCourtProceeding: Story = {
  args: { initialKind: 'federal_court' },
}

export const CopyrightClaimsBoardProceeding: Story = {
  args: { initialKind: 'ccb' },
}
