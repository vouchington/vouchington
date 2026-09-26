'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { ScoreVote } from '@/components/votes/score-vote'
import { clearPostVote, submitPostRecommendationVote } from '@/lib/api/client/elections'
import onError from '@/lib/on-error'
import type { TopicRecommendationDialogProps } from './topic-recommendation-dialog-types'
import { useTranslations } from '@/lib/i18n/use-translations'

type FooterProps = Pick<
  TopicRecommendationDialogProps,
  | 'isAdmin'
  | 'isSaving'
  | 'onApprove'
  | 'onPersistChanges'
  | 'onReject'
  | 'selected'
  | 'selectedElection'
  | 'selectedVote'
  | 'hideDownCount'
> & {
  hasPrevious: boolean
  hasNext: boolean
  previousRef: RefObject<HTMLButtonElement | null>
  nextRef: RefObject<HTMLButtonElement | null>
  onNavigatePrevious: () => void
  onNavigateNext: () => void
}

export function TopicRecommendationDialogFooter({
  hasPrevious,
  hasNext,
  hideDownCount,
  isAdmin,
  isSaving,
  nextRef,
  onApprove,
  onNavigateNext,
  onNavigatePrevious,
  onReject,
  previousRef,
  selected,
  selectedElection,
  selectedVote,
}: FooterProps) {
  const t = useTranslations()
  if (!selected) return null
  const isPending = selected.topic_recommendation?.status === 'pending'
  const disabled = isSaving || !isPending
  const DismissRecommendationIcon = EntityActionIcons.recommendationDismiss

  return (
    <div
      className='flex items-center gap-1 overflow-x-auto border-t pt-3 pb-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring'
      data-pw='topic-recommendation-dialog-footer'
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1 requires keyboard access to the scrollable region itself.
      tabIndex={0}
    >
      <Button
        ref={previousRef}
        type='button'
        variant='outline'
        size='touchIcon'
        disabled={isSaving || !hasPrevious}
        aria-disabled={isSaving || !hasPrevious}
        className='shrink-0 px-0 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:h-7 sm:w-auto sm:px-2.5'
        onClick={onNavigatePrevious}
        aria-label={t(
          'extracted.topicRecommendations.topicRecommendationDialogFooter.previous_a57b08a4',
        )}
        data-pw='topic-recommendation-dialog-previous'
      >
        <ChevronLeft className='h-4 w-4 sm:mr-1' />
        <span className='hidden sm:inline'>
          {t('extracted.topicRecommendations.topicRecommendationDialogFooter.previous_a57b08a4')}
        </span>
      </Button>

      {selectedElection ? (
        <div className='shrink-0'>
          <ScoreVote
            electionId={selectedElection.id}
            countUp={selectedElection.votes_count_up ?? 0}
            countDown={selectedElection.votes_count_down ?? 0}
            existingVoteChoice={
              selectedVote?.choice as
                | import('@/lib/api/client/elections').RecommendationChoice
                | undefined
            }
            policy='recommendation'
            submitVote={(id, choice) =>
              submitPostRecommendationVote(
                id,
                choice as import('@/lib/api/client/elections').RecommendationChoice,
              )
            }
            clearVote={clearPostVote}
            disabled={!isPending}
            hideDownCount={hideDownCount}
            onError={() =>
              onError(new Error('Failed to submit vote'), {
                fallback: t(
                  'extracted.topicRecommendations.topicRecommendationDialogFooter.failedToSubmitVote_849db9a5',
                ),
                skipSentry: true,
              })
            }
          />
        </div>
      ) : null}

      <div className='flex flex-1 justify-end gap-1'>
        <Button
          type='submit'
          form='topic-recommendation-form'
          variant='outline'
          size='sm'
          disabled={!isAdmin || disabled}
          data-pw='topic-recommendation-dialog-save'
        >
          {t('extracted.topicRecommendations.topicRecommendationDialogFooter.saveChanges_35322b5b')}
        </Button>

        {isAdmin ? (
          <>
            <Button
              type='button'
              variant='destructive'
              size='sm'
              onClick={() => onReject(selected)}
              disabled={disabled}
              data-pw='topic-recommendation-dialog-reject'
            >
              <DismissRecommendationIcon className='h-4 w-4' />
              {t(
                'extracted.topicRecommendations.topicRecommendationDialogFooter.reject_ab604a36',
              )}{' '}
              <kbd
                className='ml-1 hidden rounded border px-1 text-xs sm:inline'
                aria-hidden='true'
              >
                {t('extracted.topicRecommendations.topicRecommendationDialogFooter.r_eefa7a5b')}
              </kbd>
            </Button>
            <Button
              type='button'
              size='sm'
              onClick={() => onApprove(selected)}
              disabled={disabled}
              data-pw='topic-recommendation-dialog-approve'
            >
              {t('extracted.topicRecommendations.topicRecommendationDialogFooter.approve_6007acbe')}{' '}
              <kbd
                className='ml-1 hidden rounded border px-1 text-xs sm:inline'
                aria-hidden='true'
              >
                {t('extracted.topicRecommendations.topicRecommendationDialogFooter.a_05db6588')}
              </kbd>
            </Button>
          </>
        ) : null}
      </div>
      <Button
        ref={nextRef}
        type='button'
        variant='outline'
        size='touchIcon'
        disabled={isSaving || !hasNext}
        aria-disabled={isSaving || !hasNext}
        className='shrink-0 px-0 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:h-7 sm:w-auto sm:px-2.5'
        onClick={onNavigateNext}
        aria-label={t(
          'extracted.topicRecommendations.topicRecommendationDialogFooter.next_1ff57a29',
        )}
        data-pw='topic-recommendation-dialog-next'
      >
        <span className='hidden sm:inline'>
          {t('extracted.topicRecommendations.topicRecommendationDialogFooter.next_1ff57a29')}
        </span>
        <ChevronRight className='h-4 w-4 sm:ml-1' />
      </Button>
    </div>
  )
}
