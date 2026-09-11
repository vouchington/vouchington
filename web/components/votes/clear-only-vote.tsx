'use client'

import type { CompactVoteProps } from './score-vote-controls'
import { ClearButton } from './clear-button'
import { VoteCounts } from './vote-counts'

export function ClearOnlyVote({
  className,
  dataPw,
  disabled,
  hideDownCount,
  vote,
}: Omit<CompactVoteProps, 'choices'>) {
  return (
    <div
      className={`flex items-center gap-2 ${className ?? ''}`}
      data-vote-root={dataPw}
    >
      <ClearButton
        dataPw={dataPw}
        disabled={disabled}
        vote={vote}
      />
      <VoteCounts
        hideDownCount={hideDownCount}
        vote={vote}
      />
    </div>
  )
}
