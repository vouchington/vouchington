import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CopyrightEmailApprovalFields } from './copyright-email-approval-fields'
import {
  isCompleteCopyrightEmailApprovalDraft,
  type CopyrightEmailApprovalDraft,
} from './copyright-email-approval-model'
import type { CopyrightEmailIntake } from '@/lib/api/client/copyright-email-intakes'
import { CopyrightEmailInformationRequestField } from './copyright-email-information-request-field'
import { CopyrightEmailOriginalDownload } from './copyright-email-original-download'
import { CopyrightEmailParsedEmail } from './copyright-email-parsed-email'
import { CopyrightEmailRecommendation } from './copyright-email-recommendation'
import { CopyrightEmailSesVerdicts } from './copyright-email-ses-verdicts'
import { availableOriginalUrl } from './copyright-email-ses-verdicts-model'
import { isValidCopyrightEmailInformationMessage } from './copyright-email-information-request-model'
import { CopyrightEmailReplyAddressField } from './copyright-email-reply-address-field'
import { CopyrightEmailNoticeAssociation } from './copyright-email-notice-association'
import { CopyrightEmailCorrespondenceActions } from './copyright-email-correspondence-actions'
import type { CopyrightEmailCorrespondenceDraft } from './copyright-email-correspondence-model'
import {
  copyrightEmailManualReviewNote,
  isSeparateCopyrightEmailCase,
} from './copyright-email-review-path'

export function CopyrightEmailReviewDetail({
  detail,
  draft,
  loading,
  rationale,
  manualFallbackReason,
  replyEmail,
  correspondenceDraft,
  onChangeDraft,
  onChangeRationale,
  onChangeManualFallbackReason,
  onChangeReplyEmail,
  onChangeCorrespondenceDraft,
  onApproveInitial,
  onRejectInitial,
  onRequestInformation,
  onAdmitCorrespondence,
  onRejectCorrespondence,
  onAssociateWithNotice,
}: {
  detail: CopyrightEmailIntake
  draft: CopyrightEmailApprovalDraft | null
  loading: boolean
  rationale: string
  manualFallbackReason: string
  replyEmail: string
  correspondenceDraft: CopyrightEmailCorrespondenceDraft
  onChangeDraft: (draft: CopyrightEmailApprovalDraft) => void
  onChangeRationale: (value: string) => void
  onChangeManualFallbackReason: (value: string) => void
  onChangeReplyEmail: (value: string) => void
  onChangeCorrespondenceDraft: (draft: CopyrightEmailCorrespondenceDraft) => void
  onApproveInitial: () => void
  onRejectInitial: () => void
  onRequestInformation: (message: string) => void
  onAdmitCorrespondence: () => void
  onRejectCorrespondence: () => void
  onAssociateWithNotice: (noticeId: string) => void
}) {
  // Only an information request uses this message, so it lives here: the parent remounts this
  // component for each intake, which clears it, and a failed request keeps what staff typed.
  const [informationMessage, setInformationMessage] = useState('')
  const separateCase = isSeparateCopyrightEmailCase(detail.review_path)
  const manualReviewNote = copyrightEmailManualReviewNote(detail.review_path)
  const requiresFallback = !detail.recommendation && !manualFallbackReason.trim()
  return (
    <section className='space-y-3'>
      <h2 className='text-xl font-semibold'>Staff-private evidence</h2>
      <h3 className='font-medium'>Raw email metadata</h3>
      <pre className='overflow-auto rounded border p-3 text-xs'>
        {JSON.stringify(detail.raw_email, null, 2)}
      </pre>
      <CopyrightEmailSesVerdicts verdicts={detail.ses_verdicts} />
      <CopyrightEmailOriginalDownload
        downloadUrl={detail.raw_email.download_url}
        virus={detail.ses_verdicts.virus}
      />
      <CopyrightEmailParsedEmail
        parsedEmail={detail.parsed_email}
        parserError={detail.parser_error}
        originalAvailable={
          availableOriginalUrl(detail.raw_email.download_url, detail.ses_verdicts.virus) !== null
        }
      />
      <CopyrightEmailRecommendation recommendation={detail.recommendation} />
      {manualReviewNote && <p className='text-sm text-muted-foreground'>{manualReviewNote}</p>}
      {separateCase && draft && (
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
      {separateCase && (
        <CopyrightEmailInformationRequestField
          onChange={setInformationMessage}
          value={informationMessage}
        />
      )}
      {separateCase && !detail.parsed_email && (
        <CopyrightEmailReplyAddressField
          onChange={onChangeReplyEmail}
          value={replyEmail}
        />
      )}
      <div className='flex flex-wrap gap-2'>
        {separateCase ? (
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
              disabled={
                loading ||
                !rationale.trim() ||
                !isValidCopyrightEmailInformationMessage(informationMessage) ||
                requiresFallback
              }
              onClick={() => onRequestInformation(informationMessage)}
              variant='outline'
            >
              Request information
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
          <CopyrightEmailCorrespondenceActions
            detail={detail}
            draft={correspondenceDraft}
            loading={loading}
            onAdmit={onAdmitCorrespondence}
            onChange={onChangeCorrespondenceDraft}
            onReject={onRejectCorrespondence}
            rationale={rationale}
            requiresFallback={requiresFallback}
          />
        ) : (
          <p className='text-sm text-muted-foreground'>
            This is a reply whose root email has not yet been admitted. It cannot be handled as a
            separate case; it will become a correspondence review once the root case is linked.
          </p>
        )}
      </div>
      {detail.linked_notice === null && (
        <CopyrightEmailNoticeAssociation
          loading={loading}
          onAssociateWithNotice={onAssociateWithNotice}
        />
      )}
    </section>
  )
}
