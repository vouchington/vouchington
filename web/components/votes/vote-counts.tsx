import type { ScoreVoteState } from './score-vote-types'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'

interface VoteCountsProps {
  hideDownCount?: boolean
  vote: ScoreVoteState
}

export function VoteCounts({ hideDownCount, vote }: VoteCountsProps) {
  const uiLocale = useUiLocale()
  return (
    <span
      className='text-xs tabular-nums'
      data-pw='vote-count-up'
    >
      +{formatNumber(vote.countUp, uiLocale)}
      {!hideDownCount && (
        <span data-pw='vote-count-down'> −{formatNumber(vote.countDown, uiLocale)}</span>
      )}
    </span>
  )
}
