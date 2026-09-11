'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import onError from '@/lib/on-error/on-error'
import { createTopicClaim } from '@/lib/api/client/topic-claims'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ClaimTopicFormProps {
  topicIdOrSlug: string
  onSuccess: (claimId: string) => void
}

export function ClaimTopicForm({ topicIdOrSlug, onSuccess }: ClaimTopicFormProps) {
  const t = useTranslations()
  const [claimedRole, setClaimedRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!claimedRole.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await createTopicClaim(topicIdOrSlug, { claimed_role: claimedRole })
      onSuccess(result.claim.id)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('extracted.topicClaims.claimTopicForm.failedToSubmitClaim_764dc1cf'),
      )
      onError(error, {
        fallback: t('extracted.topicClaims.claimTopicForm.anErrorOccurred_ddf785b7'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-4'
      data-pw='claim-topic-form'
    >
      <div className='space-y-1'>
        <Label htmlFor='claimed-role'>
          {t('extracted.topicClaims.claimTopicForm.yourRole_09bdccc5')}
        </Label>
        <Input
          id='claimed-role'
          value={claimedRole}
          onChange={e => setClaimedRole(e.target.value)}
          placeholder={t(
            'extracted.topicClaims.claimTopicForm.eGCardIssuerProgramOperator_9b84a6cf',
          )}
          maxLength={255}
          required
        />
        <p className='text-xs text-muted-foreground'>
          {t('extracted.topicClaims.claimTopicForm.describeYourRelationshipToThisTopic_db0d1312')}
        </p>
      </div>
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      <Button
        type='submit'
        loading={loading}
        disabled={loading || !claimedRole.trim()}
        data-pw='claim-submit'
      >
        {loading
          ? t('extracted.topicClaims.claimTopicForm.submitting_64115d5b')
          : t('extracted.topicClaims.claimTopicForm.claimThisTopic_513ea018')}
      </Button>
    </form>
  )
}
