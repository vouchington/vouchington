'use client'

import Link from 'next/link'
import { CheckCircle2, RotateCcw, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PostContentText } from '@/components/posts/post-content-text'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CommunityAutomodAction } from '@/types/api-responses'
import {
  AUTOMOD_REVIEW_REASON_CODES,
  formatAutomodConfidence,
  formatAutomodCurrentState,
  formatAutomodSource,
  type PendingAutomodReviewAction,
} from './community-automod-review-helpers'

interface CommunityAutomodReviewActionProps {
  action: CommunityAutomodAction
  reason: string | undefined
  note: string
  disabled: boolean
  onReasonSelect: (reason: string) => void
  onNoteChange: (note: string) => void
  onSubmit: (pendingAction: PendingAutomodReviewAction) => void
}

export function CommunityAutomodReviewAction({
  action,
  reason,
  note,
  disabled,
  onReasonSelect,
  onNoteChange,
  onSubmit,
}: CommunityAutomodReviewActionProps) {
  const t = useTranslations()
  return (
    <article className='grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[1fr_auto]'>
      <div className='min-w-0 space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='secondary'>{formatAutomodSource(action)}</Badge>
          <Badge variant='outline'>{formatAutomodCurrentState(action.current_state)}</Badge>
          {action.confidence_score == null ? null : (
            <Badge variant='outline'>{formatAutomodConfidence(action.confidence_score)}</Badge>
          )}
        </div>
        <div className='space-y-1'>
          <Link
            className='block truncate font-medium underline-offset-4 hover:underline'
            href={action.post_href}
          >
            <PostContentText
              as='span'
              content={{
                text: action.authored_title,
                declared_language: action.declared_language,
                lingua_rs_detected_language: action.lingua_rs_detected_language,
              }}
              fallback={t(
                'extracted.communities.communityAutomodReviewAction.untitledPost_45419482',
              )}
            />
          </Link>
          {action.markdown_preview ? (
            <PostContentText
              as='p'
              className='line-clamp-2 text-sm text-muted-foreground'
              content={{
                text: action.markdown_preview,
                declared_language: action.declared_language,
                lingua_rs_detected_language: action.lingua_rs_detected_language,
              }}
            />
          ) : null}
        </div>
        <div className='flex flex-wrap gap-1'>
          {action.reason ? <Badge variant='outline'>{action.reason}</Badge> : null}
          {action.categories.slice(0, 5).map(category => (
            <Badge
              key={category}
              variant='outline'
            >
              {category}
            </Badge>
          ))}
        </div>
        <div className='flex flex-wrap gap-2'>
          {AUTOMOD_REVIEW_REASON_CODES.map(reasonOption => (
            <Button
              key={reasonOption.value}
              type='button'
              variant={reason === reasonOption.value ? 'default' : 'outline'}
              size='sm'
              disabled={disabled}
              onClick={() => onReasonSelect(reasonOption.value)}
            >
              <Tag className='size-3.5' />
              {reasonOption.label}
            </Button>
          ))}
        </div>
        <Textarea
          className='min-h-16 text-sm'
          maxLength={1000}
          placeholder={t(
            'extracted.communities.communityAutomodReviewPanel.optionalModeratorNote_89995490',
          )}
          value={note}
          disabled={disabled}
          onChange={event => onNoteChange(event.target.value)}
        />
      </div>
      <div className='flex flex-wrap items-start gap-2 md:w-44 md:flex-col'>
        <Button
          type='button'
          className='w-full justify-start'
          disabled={disabled}
          onClick={() => onSubmit('reinstate')}
          data-pw='automod-approve-button'
        >
          <RotateCcw className='size-4' />
          {t('extracted.communities.communityAutomodReviewAction.reinstate_67cbd550')}
        </Button>
        <Button
          type='button'
          variant='outline'
          className='w-full justify-start'
          disabled={disabled}
          onClick={() => onSubmit('keep_removed')}
          data-pw='automod-reject-button'
        >
          <CheckCircle2 className='size-4' />
          {t('extracted.communities.communityAutomodReviewAction.keepRemoved_13f1d692')}
        </Button>
      </div>
    </article>
  )
}
