import { Button } from '@/components/ui/button'
import type { CopyrightEmailIntake } from '@/lib/api/client/copyright-email-intakes'
import { CopyrightEmailCorrespondenceFields } from './copyright-email-correspondence-fields'
import {
  isCompleteCopyrightEmailCorrespondenceDraft,
  type CopyrightEmailCorrespondenceDraft,
} from './copyright-email-correspondence-model'

export function CopyrightEmailCorrespondenceActions({
  detail,
  draft,
  loading,
  onAdmit,
  onChange,
  onReject,
  rationale,
  requiresFallback,
}: {
  detail: CopyrightEmailIntake
  draft: CopyrightEmailCorrespondenceDraft
  loading: boolean
  onAdmit: () => void
  onChange: (draft: CopyrightEmailCorrespondenceDraft) => void
  onReject: () => void
  rationale: string
  requiresFallback: boolean
}) {
  return (
    <>
      <CopyrightEmailCorrespondenceFields
        detail={detail}
        draft={draft}
        onChange={onChange}
      />
      <Button
        data-pw='copyright-email-correspondence-actions-admit'
        disabled={
          loading ||
          !rationale.trim() ||
          !isCompleteCopyrightEmailCorrespondenceDraft(draft) ||
          requiresFallback
        }
        onClick={onAdmit}
      >
        Admit correspondence
      </Button>
      <Button
        data-pw='copyright-email-correspondence-actions-reject'
        disabled={loading || !rationale.trim() || requiresFallback}
        onClick={onReject}
        variant='destructive'
      >
        Reject correspondence
      </Button>
    </>
  )
}
