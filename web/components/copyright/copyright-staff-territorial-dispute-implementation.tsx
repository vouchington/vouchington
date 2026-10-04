'use client'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { recordCopyrightEuDisputeSettlementImplementation } from '@/lib/api/client/copyright-territorial-redress'
import type { SubmitReview } from './copyright-staff-review-buttons'

export function CopyrightStaffTerritorialImplementationFields({
  implementedAt,
  noticeId,
  onReview,
  pending,
  referralId,
  setImplementedAt,
}: {
  implementedAt: string
  noticeId: string
  onReview: SubmitReview
  pending: boolean
  referralId: string
  setImplementedAt: (value: string) => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={`dispute-implemented-at-${referralId}`}>Implementation date</Label>
      <Input
        id={`dispute-implemented-at-${referralId}`}
        onChange={event => setImplementedAt(event.target.value)}
        type='datetime-local'
        value={implementedAt}
      />
      <ButtonGroup>
        <Button
          disabled={pending || !implementedAt}
          onClick={() =>
            onReview(
              () =>
                recordCopyrightEuDisputeSettlementImplementation(noticeId, referralId, {
                  implemented_at: new Date(implementedAt).toISOString(),
                }),
              'Dispute settlement implementation recorded.',
            )
          }
          size='touchSm'
        >
          Record implementation
        </Button>
      </ButtonGroup>
    </div>
  )
}
