'use client'

import Link from 'next/link'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { topicRecommendationHref } from '@/lib/links/entity-href'
import type { TopicRecommendationTablePost } from './topic-recommendations-table'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TopicRecommendationRowActionsProps {
  isAdmin: boolean
  isOwner: boolean
  isPending: boolean
  post: TopicRecommendationTablePost
  onQuickApprove: (post: TopicRecommendationTablePost) => void
  onQuickReject: (post: TopicRecommendationTablePost) => void
  onWithdraw: (post: TopicRecommendationTablePost) => void
}

export function TopicRecommendationRowActions({
  isAdmin,
  isOwner,
  isPending,
  post,
  onQuickApprove,
  onQuickReject,
  onWithdraw,
}: TopicRecommendationRowActionsProps) {
  const t = useTranslations()
  const DismissRecommendationIcon = EntityActionIcons.recommendationDismiss
  const EditIcon = EntityActionIcons.edit
  const WithdrawRecommendationIcon = EntityActionIcons.recommendationWithdraw

  return (
    <div className='flex justify-end gap-2'>
      {isPending && isAdmin ? (
        <>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onQuickApprove(post)}
            data-pw='topic-recommendation-row-approve'
          >
            {t('extracted.topicRecommendations.topicRecommendationRowActions.approve_6007acbe')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onQuickReject(post)}
            data-pw='topic-recommendation-row-reject'
          >
            <DismissRecommendationIcon className='h-4 w-4' />
            {t('extracted.topicRecommendations.topicRecommendationRowActions.reject_ab604a36')}
          </Button>
        </>
      ) : null}
      {isPending && isOwner && !isAdmin ? (
        <>
          <Button
            asChild
            variant='outline'
            size='sm'
            data-pw='topic-recommendation-row-edit'
          >
            <Link
              href={topicRecommendationHref(post, '/edit')}
              prefetch={false}
            >
              <EditIcon className='h-4 w-4' />
              {t('extracted.topicRecommendations.topicRecommendationRowActions.edit_464c4ffd')}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant='destructive'
                size='sm'
                data-pw='topic-recommendation-row-withdraw'
              >
                <WithdrawRecommendationIcon className='h-4 w-4' />
                {t(
                  'extracted.topicRecommendations.topicRecommendationRowActions.withdraw_164546a9',
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent data-pw='topic-recommendation-withdraw-dialog'>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(
                    'extracted.topicRecommendations.topicRecommendationRowActions.withdrawRecommendation_e23b339a',
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription data-pw='topic-recommendation-withdraw-description'>
                  {t(
                    'extracted.topicRecommendations.topicRecommendationRowActions.withdrawThisRecommendationItWillBe_986fc834',
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t(
                    'extracted.topicRecommendations.topicRecommendationRowActions.cancel_19766ed6',
                  )}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onWithdraw(post)}
                  data-pw='topic-recommendation-withdraw-confirm'
                >
                  {t(
                    'extracted.topicRecommendations.topicRecommendationRowActions.withdraw_164546a9',
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  )
}
