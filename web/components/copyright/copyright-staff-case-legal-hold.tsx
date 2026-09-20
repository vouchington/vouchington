'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  assessCopyrightLegalHold,
  resolveCopyrightLegalHold,
} from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { ReviewButtons, type SubmitReview } from './copyright-staff-review-buttons'
import {
  CopyrightStaffLegalHoldTargetSelector,
  CopyrightStaffProceedingFields,
  type LegalHoldProceedingKind,
} from './copyright-staff-legal-hold-fields'

export function CopyrightStaffLegalHoldReview({
  hold,
  targets,
  pending,
  rationale,
  submit,
}: {
  hold: CopyrightStaffQueueItem['legal_holds'][number]
  targets: CopyrightStaffQueueItem['targets']
  pending: boolean
  rationale: string
  submit: SubmitReview
}) {
  const [fromOriginalClaimant, setFromOriginalClaimant] = useState(false)
  const [sameMaterial, setSameMaterial] = useState(false)
  const [proceedingKind, setProceedingKind] = useState<LegalHoldProceedingKind>('none')
  const [ccbClaimKind, setCcbClaimKind] = useState<'claim' | 'counterclaim'>('claim')
  const [commencedAt, setCommencedAt] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [selectedTargetIds, setSelectedTargetIds] = useState(() => targets.map(target => target.id))
  const assessment = hold.assessment
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>Court or Copyright Claims Board filing</h3>
      <pre className='overflow-auto rounded bg-muted p-2 text-xs'>
        {JSON.stringify(hold.statement, null, 2)}
      </pre>
      {!assessment ? (
        <LegalHoldAssessmentFields
          ccbClaimKind={ccbClaimKind}
          commencedAt={commencedAt}
          fromOriginalClaimant={fromOriginalClaimant}
          hold={hold}
          pending={pending}
          proceedingKind={proceedingKind}
          rationale={rationale}
          receivedAt={receivedAt}
          sameMaterial={sameMaterial}
          selectedTargetIds={selectedTargetIds}
          setCcbClaimKind={setCcbClaimKind}
          setCommencedAt={setCommencedAt}
          setFromOriginalClaimant={setFromOriginalClaimant}
          setProceedingKind={setProceedingKind}
          setReceivedAt={setReceivedAt}
          setSameMaterial={setSameMaterial}
          setSelectedTargetIds={setSelectedTargetIds}
          submit={submit}
          targets={targets}
        />
      ) : assessment.qualifying && !assessment.resolved ? (
        <ReviewButtons
          pending={pending}
          canSubmit={rationale.length > 0}
          submit={submit}
          approve={() => resolveCopyrightLegalHold(assessment.id, 'proceeding_ended', rationale)}
          reject={() => resolveCopyrightLegalHold(assessment.id, 'dismissed', rationale)}
          heading='Active legal hold'
          description='Resolve this only after documented confirmation that the proceeding no longer blocks restoration.'
          approveLabel='Record proceeding ended'
          rejectLabel='Record dismissal'
        />
      ) : (
        <p className='text-sm text-muted-foreground'>
          {assessment.resolved
            ? 'Legal hold resolved.'
            : 'Filing does not qualify as a legal hold.'}
        </p>
      )}
    </section>
  )
}

type LegalHoldAssessmentFieldsProps = {
  ccbClaimKind: 'claim' | 'counterclaim'
  commencedAt: string
  fromOriginalClaimant: boolean
  hold: CopyrightStaffQueueItem['legal_holds'][number]
  pending: boolean
  proceedingKind: 'none' | 'federal_court' | 'ccb'
  rationale: string
  receivedAt: string
  sameMaterial: boolean
  selectedTargetIds: string[]
  setCcbClaimKind: (value: 'claim' | 'counterclaim') => void
  setCommencedAt: (value: string) => void
  setFromOriginalClaimant: (value: boolean) => void
  setProceedingKind: (value: 'none' | 'federal_court' | 'ccb') => void
  setReceivedAt: (value: string) => void
  setSameMaterial: (value: boolean) => void
  setSelectedTargetIds: React.Dispatch<React.SetStateAction<string[]>>
  submit: SubmitReview
  targets: CopyrightStaffQueueItem['targets']
}

function LegalHoldAssessmentFields({
  ccbClaimKind,
  commencedAt,
  fromOriginalClaimant,
  hold,
  pending,
  proceedingKind,
  rationale,
  receivedAt,
  sameMaterial,
  selectedTargetIds,
  setCcbClaimKind,
  setCommencedAt,
  setFromOriginalClaimant,
  setProceedingKind,
  setReceivedAt,
  setSameMaterial,
  setSelectedTargetIds,
  submit,
  targets,
}: LegalHoldAssessmentFieldsProps) {
  const canRecord =
    !pending &&
    rationale.trim().length > 0 &&
    selectedTargetIds.length > 0 &&
    (proceedingKind === 'none' || (commencedAt.length > 0 && receivedAt.length > 0))
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
        holdId={hold.submission_id}
        selectedTargetIds={selectedTargetIds}
        setSelectedTargetIds={setSelectedTargetIds}
        targets={targets}
      />
      <Button
        disabled={!canRecord}
        onClick={() =>
          submit(
            () =>
              assessCopyrightLegalHold(hold.submission_id, {
                rationale,
                from_original_claimant: fromOriginalClaimant,
                proceeding_kind: proceedingKind === 'none' ? null : proceedingKind,
                ccb_claim_kind: proceedingKind === 'ccb' ? ccbClaimKind : null,
                commenced_at: commencedAt ? new Date(commencedAt).toISOString() : null,
                received_by_designated_agent_at: receivedAt
                  ? new Date(receivedAt).toISOString()
                  : null,
                same_material: sameMaterial,
                target_ids: selectedTargetIds,
              }),
            'Legal hold assessment recorded.',
          )
        }
      >
        Record assessment
      </Button>
    </div>
  )
}
