'use client'

import { Meh, ThumbsDown, ThumbsUp, UserCheck, UserX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { clearUserVouchVote, submitUserVouchVote } from '@/lib/api/client/elections'
import { UserSignalElectionCard } from './user-signal-election-card'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UserVouchElectionCardProps {
  userId: string
  displayName: string
  submitVote?: (
    id: string,
    choice: import('@/lib/api/client/elections').SentimentChoice,
  ) => Promise<void>
  clearVote?: (id: string) => Promise<void>
  initialChoice?: import('@/lib/api/client/elections').SentimentChoice | null
  canCreateTrustSignal?: boolean
  onDisavowSubmitted?: () => void
  'data-pw'?: string
}

export function UserVouchElectionCard(props: UserVouchElectionCardProps) {
  if (props.onDisavowSubmitted)
    return (
      <UserVouchElectionCardContent
        {...props}
        onDisavowSubmitted={props.onDisavowSubmitted}
      />
    )

  return <RoutedUserVouchElectionCard {...props} />
}

function RoutedUserVouchElectionCard(props: UserVouchElectionCardProps) {
  const { refresh } = useRouter()
  return (
    <UserVouchElectionCardContent
      {...props}
      onDisavowSubmitted={refresh}
    />
  )
}

function UserVouchElectionCardContent({
  userId,
  displayName,
  submitVote = submitUserVouchVote,
  clearVote = clearUserVouchVote,
  initialChoice = null,
  canCreateTrustSignal = true,
  onDisavowSubmitted,
  'data-pw': dataPw = 'user-vouch-election-card',
}: UserVouchElectionCardProps & { onDisavowSubmitted: () => void }) {
  const t = useTranslations()
  return (
    <UserSignalElectionCard
      userId={userId}
      title={t('extracted.users.userVouchElectionCard.vouchCheck_238e72d4')}
      description={t('extracted.users.userVouchElectionCard.doYouTrustDisplayname_95efcde4', {
        displayName,
      })}
      submitVote={submitVote}
      clearVote={clearVote}
      initialChoice={initialChoice}
      canCreateTrustSignal={canCreateTrustSignal}
      onVoteSubmitted={choice => {
        if (choice === 'disavow') onDisavowSubmitted()
      }}
      errorMessage={t(
        'extracted.users.userVouchElectionCard.failedToUpdateVouchVotePlease_a41c1e8f',
      )}
      data-pw={dataPw}
      actions={[
        {
          choice: 'vouch',
          label: t('extracted.users.userVouchElectionCard.vouch_ca4533ad'),
          ariaLabel: t('extracted.users.userVouchElectionCard.vouchForDisplayname_ae0a2287', {
            displayName,
          }),
          tooltip: t('extracted.users.userVouchElectionCard.submitAVouchSignalForThis_9b9d91b2'),
          successMessage: t(
            'extracted.users.userVouchElectionCard.vouchedForDisplayname_32e0daee',
            { displayName },
          ),
          icon: UserCheck,
        },
        {
          choice: 'like',
          label: t('extracted.votes.semanticVote.like'),
          ariaLabel: t('extracted.votes.semanticVote.like'),
          tooltip: t('extracted.votes.semanticVote.like'),
          successMessage: t('extracted.votes.semanticVote.like'),
          icon: ThumbsUp,
        },
        {
          choice: 'neutral',
          label: t('extracted.votes.semanticVote.neutral'),
          ariaLabel: t('extracted.votes.semanticVote.neutral'),
          tooltip: t('extracted.votes.semanticVote.neutral'),
          successMessage: t('extracted.votes.semanticVote.neutral'),
          icon: Meh,
        },
        {
          choice: 'dislike',
          label: t('extracted.votes.semanticVote.dislike'),
          ariaLabel: t('extracted.votes.semanticVote.dislike'),
          tooltip: t('extracted.votes.semanticVote.dislike'),
          successMessage: t('extracted.votes.semanticVote.dislike'),
          icon: ThumbsDown,
        },
        {
          choice: 'disavow',
          label: t('extracted.users.userVouchElectionCard.disavow_a9c0b4d2'),
          ariaLabel: t('extracted.users.userVouchElectionCard.disavowDisplayname_76bdc68f', {
            displayName,
          }),
          tooltip: t(
            'extracted.users.userVouchElectionCard.marksTheProfileAsDisavowedUnfollows_49accd1f',
          ),
          successMessage: t(
            'extracted.users.userVouchElectionCard.disavowedDisplaynameUnfollowedAndMuted_03c40952',
            { displayName },
          ),
          icon: UserX,
          variant: 'destructive',
        },
      ]}
    />
  )
}
