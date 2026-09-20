import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CopyrightEmailApprovalFields } from './copyright-email-approval-fields'
import {
  isCompleteCopyrightEmailApprovalDraft,
  type CopyrightEmailApprovalDraft,
} from './copyright-email-approval-model'
import type { CopyrightEmailIntake } from '@/lib/api/client/copyright-email-intakes'
import { CopyrightEmailCorrespondenceFields } from './copyright-email-correspondence-fields'
import {
  isCompleteCopyrightEmailCorrespondenceDraft,
  type CopyrightEmailCorrespondenceDraft,
} from './copyright-email-correspondence-model'

export function CopyrightEmailReviewDetail({
  detail,
  draft,
  loading,
  rationale,
  manualFallbackReason,
  correspondenceDraft,
  onChangeDraft,
  onChangeRationale,
  onChangeManualFallbackReason,
  onChangeCorrespondenceDraft,
  onApproveInitial,
  onRejectInitial,
  onAdmitCorrespondence,
  onRejectCorrespondence,
}: {
  detail: CopyrightEmailIntake
  draft: CopyrightEmailApprovalDraft | null
  loading: boolean
  rationale: string
  manualFallbackReason: string
  correspondenceDraft: CopyrightEmailCorrespondenceDraft
  onChangeDraft: (draft: CopyrightEmailApprovalDraft) => void
  onChangeRationale: (value: string) => void
  onChangeManualFallbackReason: (value: string) => void
  onChangeCorrespondenceDraft: (draft: CopyrightEmailCorrespondenceDraft) => void
  onApproveInitial: () => void
  onRejectInitial: () => void
  onAdmitCorrespondence: () => void
  onRejectCorrespondence: () => void
}) {
  const requiresFallback = !detail.recommendation && !manualFallbackReason.trim()
  return (
    <section className='space-y-3'>
      <h2 className='text-xl font-semibold'>Staff-private evidence</h2>
      <h3 className='font-medium'>Raw email metadata</h3>
      <pre className='overflow-auto rounded border p-3 text-xs'>
        {JSON.stringify(detail.raw_email, null, 2)}
      </pre>
      <Button
        asChild
        variant='outline'
      >
        <a href={detail.raw_email.download_url}>Download original email and attachments</a>
      </Button>
      <h3 className='font-medium'>Parsed email</h3>
      <pre className='overflow-auto rounded border p-3 text-xs'>
        {JSON.stringify(detail.parsed_email, null, 2)}
      </pre>
      <h3 className='font-medium'>Agent recommendation</h3>
      <pre className='overflow-auto rounded border p-3 text-xs'>
        {JSON.stringify(detail.recommendation, null, 2)}
      </pre>
      {detail.review_path === 'initial' && draft && (
        <CopyrightEmailApprovalFields
          draft={draft}
          onChange={onChangeDraft}
        />
      )}
      <Textarea
        aria-label='Review rationale'
        onChange={event => onChangeRationale(event.target.value)}
        placeholder='Review rationale'
        value={rationale}
      />
      {!detail.recommendation && (
        <Textarea
          aria-label='Manual fallback reason'
          onChange={event => onChangeManualFallbackReason(event.target.value)}
          placeholder='Why staff is proceeding without an agent recommendation'
          value={manualFallbackReason}
        />
      )}
      <div className='flex flex-wrap gap-2'>
        {detail.review_path === 'initial' ? (
          <>
            <Button
              disabled={
                loading ||
                !rationale.trim() ||
                !draft ||
                !isCompleteCopyrightEmailApprovalDraft(draft) ||
                requiresFallback
              }
              onClick={onApproveInitial}
            >
              Approve structured intake
            </Button>
            <Button
              disabled={loading || !rationale.trim() || requiresFallback}
              onClick={onRejectInitial}
              variant='destructive'
            >
              Reject email intake
            </Button>
          </>
        ) : detail.review_path === 'matched_thread' ? (
          <>
            <CopyrightEmailCorrespondenceFields
              detail={detail}
              draft={correspondenceDraft}
              onChange={onChangeCorrespondenceDraft}
            />
            <Button
              disabled={
                loading ||
                !rationale.trim() ||
                !isCompleteCopyrightEmailCorrespondenceDraft(correspondenceDraft) ||
                requiresFallback
              }
              onClick={onAdmitCorrespondence}
            >
              Admit correspondence
            </Button>
            <Button
              disabled={loading || !rationale.trim() || requiresFallback}
              onClick={onRejectCorrespondence}
              variant='destructive'
            >
              Reject correspondence
            </Button>
          </>
        ) : (
          <p className='text-sm text-muted-foreground'>
            This is a reply whose root email has not yet been admitted. It cannot be handled as a
            separate case; it will become a correspondence review once the root case is linked.
          </p>
        )}
      </div>
    </section>
  )
}
