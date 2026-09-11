'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimeAgo } from '@/components/shared/time-ago'
import onError from '@/lib/on-error/on-error'
import {
  adminVerifyTopicClaim,
  adminRejectTopicClaim,
  adminRevokeTopicClaim,
} from '@/lib/api/client/topic-claims'
import { getTopicClaimState, type TopicClaim } from '@/types/topic-claims'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TopicClaimReviewProps {
  claim: TopicClaim
}

export function TopicClaimReview({ claim }: TopicClaimReviewProps) {
  const t = useTranslations()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectionReason, setRejectionReason] = useState('')
  const [revocationReason, setRevocationReason] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const state = getTopicClaimState(claim)

  async function handleVerify() {
    setLoading('verify')
    setError(null)
    try {
      await adminVerifyTopicClaim(claim.id)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('extracted.admin.topicClaimReview.failedToVerifyClaim_97a65960'),
      )
      onError(error, { fallback: t('extracted.admin.topicClaimReview.anErrorOccurred_ddf785b7') })
    } finally {
      setLoading(null)
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim()) return
    setLoading('reject')
    setError(null)
    try {
      await adminRejectTopicClaim(claim.id, rejectionReason)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('extracted.admin.topicClaimReview.failedToRejectClaim_93d4aec4'),
      )
      onError(error, { fallback: t('extracted.admin.topicClaimReview.anErrorOccurred_ddf785b7') })
    } finally {
      setLoading(null)
    }
  }

  async function handleRevoke() {
    if (!revocationReason.trim()) return
    setLoading('revoke')
    setError(null)
    try {
      await adminRevokeTopicClaim(claim.id, revocationReason)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('extracted.admin.topicClaimReview.failedToRevokeClaim_776b0940'),
      )
      onError(error, { fallback: t('extracted.admin.topicClaimReview.anErrorOccurred_ddf785b7') })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div
      className='space-y-3 rounded-md border p-4'
      data-pw='topic-claim-review'
    >
      <div className='flex items-start justify-between'>
        <div>
          <p className='text-sm font-medium'>
            {t('extracted.admin.topicClaimReview.claimClaimid_c2bbbef2', {
              claimId: claim.id.slice(0, 8),
            })}
          </p>
          <p className='text-xs text-muted-foreground'>
            {t('extracted.admin.topicClaimReview.topicTopicid_0b0c4258', {
              topicId: claim.topic_id.slice(0, 8),
            })}{' '}
            <TimeAgo date={claim.created_at} />
          </p>
          <p className='mt-1 text-xs'>
            {t('extracted.admin.topicClaimReview.roleRole_4c7be8b1', { role: claim.claimed_role })}
          </p>
        </div>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {state}
        </span>
      </div>
      {claim.evidence ? (
        <div className='rounded bg-muted p-2'>
          <p className='mb-1 text-xs font-medium'>
            {t('extracted.admin.topicClaimReview.evidence_e56d5168')}
          </p>
          <p className='whitespace-pre-wrap text-sm'>{claim.evidence}</p>
        </div>
      ) : null}
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      {state === 'pending' ? (
        <div className='space-y-2'>
          <div className='flex gap-2'>
            <Button
              size='sm'
              onClick={handleVerify}
              loading={loading === 'verify'}
              disabled={loading !== null || isPending}
              data-pw='claim-approve'
            >
              {loading === 'verify'
                ? t('extracted.admin.topicClaimReview.verifying_2ec1ac7d')
                : t('extracted.admin.topicClaimReview.verifyApprove_94afa28e')}
            </Button>
          </div>
          <div className='flex gap-2'>
            <Input
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder={t('extracted.admin.topicClaimReview.rejectionReasonRequired_7891700f')}
              className='text-sm'
            />
            <Button
              size='sm'
              variant='outline'
              onClick={handleReject}
              disabled={loading !== null || isPending || !rejectionReason.trim()}
              data-pw='claim-reject'
            >
              {t('extracted.admin.topicClaimReview.reject_ab604a36')}
            </Button>
          </div>
        </div>
      ) : state === 'verified' ? (
        <div className='flex gap-2'>
          <Input
            value={revocationReason}
            onChange={e => setRevocationReason(e.target.value)}
            placeholder={t('extracted.admin.topicClaimReview.revocationReasonRequired_c8ffed1e')}
            className='text-sm'
          />
          <Button
            size='sm'
            variant='destructive'
            onClick={handleRevoke}
            disabled={loading !== null || isPending || !revocationReason.trim()}
            data-pw='claim-revoke'
          >
            {t('extracted.admin.topicClaimReview.revoke_87e6d00b')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
