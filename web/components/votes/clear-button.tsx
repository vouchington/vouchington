'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ScoreVoteState } from './score-vote-types'

interface ClearButtonProps {
  dataPw?: string
  disabled?: boolean
  vote: ScoreVoteState
}

export function ClearButton({ dataPw = 'vote', disabled, vote }: ClearButtonProps) {
  const t = useTranslations()
  return (
    <Button
      type='button'
      variant='ghost'
      size='touchSm'
      disabled={disabled || vote.isLoading || vote.currentVote === null}
      onClick={() => {
        void vote.handleClear()
      }}
      data-pw='semantic-vote-clear'
      data-vote-clear-for={dataPw}
    >
      {t('extracted.votes.semanticVote.clear')}
    </Button>
  )
}
