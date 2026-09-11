// no-mistakes-disable-file playwright-unique-test-ids -- ScoreVote's mutually exclusive signed-out, group, binary, and compact branches share one caller-owned test namespace
'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useOptionalAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useLoginHref } from '@/hooks/use-login-href'
import { useElectionVote } from '@/lib/votes/use-election-vote'
import type { ElectionVoteChoice } from '@/lib/api/client/elections'
import { BinaryVote, ChoiceGroup, CompactVote, VoteCounts } from './score-vote-controls'
import { ClearButton } from './clear-button'
import { ClearOnlyVote } from './clear-only-vote'
import type { ScoreVoteProps } from './score-vote-types'

export type { ScoreVoteProps } from './score-vote-types'

const POLICY_CHOICES = {
  sentiment: ['vouch', 'like', 'neutral', 'dislike', 'disavow'],
  recommendation: ['support', 'oppose'],
  relation: ['confirm', 'dispute'],
  moderation: ['accurate', 'inaccurate'],
} as const

function visiblePolicyChoices(
  policy: keyof typeof POLICY_CHOICES,
  currentVote: ElectionVoteChoice | null,
): readonly ElectionVoteChoice[] {
  const choices = POLICY_CHOICES[policy] as readonly ElectionVoteChoice[]
  if (policy !== 'sentiment' || currentVote !== null) return choices
  return choices.filter(choice => choice !== 'neutral')
}

export function ScoreVote({ 'data-pw': dataPw = 'score-vote', ...props }: ScoreVoteProps) {
  const auth = useOptionalAuth()
  const t = useTranslations()
  const loginHref = useLoginHref('vote')

  const policy = props.policy ?? 'sentiment'
  const vote = useElectionVote(props.entityType ?? 'post', props.electionId, {
    initialVote: props.existingVoteChoice ?? null,
    initialCountUp: props.countUp,
    initialCountDown: props.countDown,
    submitVote: choice =>
      (props.submitVote as (id: string, voteChoice: ElectionVoteChoice) => Promise<void>)(
        props.electionId,
        choice,
      ),
    clearVote: () => props.clearVote(props.electionId),
    disabled: props.disabled,
    onError: props.onError,
  })
  const choices = visiblePolicyChoices(policy, vote.currentVote)
  if (auth?.currentUser?.isOfficialAccount && !props.allowOfficialAccounts) {
    if (vote.currentVote === null) return null
    return (
      <ClearOnlyVote
        className={props.className}
        dataPw={dataPw}
        disabled={props.disabled}
        hideDownCount={props.hideDownCount}
        vote={vote}
      />
    )
  }

  if (props.signedOut) {
    return (
      <div
        className={`flex items-center gap-2 ${props.className ?? ''}`}
        data-pw={dataPw}
      >
        <Button
          asChild
          variant='ghost'
          size='touch'
          // oxlint-disable-next-line no-mistakes/playwright-literals -- fixed suffix under ScoreVote's literal-default test namespace
          data-pw={`${dataPw}-sign-in`}
        >
          <Link
            href={loginHref}
            prefetch={false}
          >
            {t('extracted.votes.semanticVote.signIn')}
          </Link>
        </Button>
        <VoteCounts
          hideDownCount={props.hideDownCount}
          vote={vote}
        />
      </div>
    )
  }

  const officialClear =
    auth?.currentUser?.isOfficialAccount && vote.currentVote !== null ? (
      <ClearButton
        dataPw={dataPw}
        disabled={props.disabled}
        vote={vote}
      />
    ) : null

  if (props.presentation === 'group' && choices.length > 2) {
    return (
      <div
        className={props.className}
        data-vote-root={dataPw}
      >
        <ChoiceGroup
          choices={choices}
          dataPw={dataPw}
          disabled={props.disabled}
          vote={vote}
        />
        {officialClear}
      </div>
    )
  }

  if (choices.length === 2) {
    return (
      <div
        className={`flex items-center gap-2 ${props.className ?? ''}`}
        data-vote-root={dataPw}
      >
        <BinaryVote
          choices={choices}
          dataPw={dataPw}
          disabled={props.disabled}
          hideDownCount={props.hideDownCount}
          vote={vote}
        />
        {officialClear}
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 ${props.className ?? ''}`}
      data-vote-root={dataPw}
    >
      <CompactVote
        choices={choices}
        dataPw={dataPw}
        disabled={props.disabled}
        hideDownCount={props.hideDownCount}
        vote={vote}
      />
      {officialClear}
    </div>
  )
}
