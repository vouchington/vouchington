'use client'

import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ElectionVoteChoice } from '@/lib/api/client/elections'
import type { ScoreVoteState } from './score-vote-types'
import { VoteCounts } from './vote-counts'

export { VoteCounts } from './vote-counts'

const CHOICE_MESSAGE_KEYS = {
  accurate: 'extracted.votes.semanticVote.accurate',
  confirm: 'extracted.votes.semanticVote.confirm',
  disavow: 'extracted.votes.semanticVote.disavow',
  dislike: 'extracted.votes.semanticVote.dislike',
  dispute: 'extracted.votes.semanticVote.dispute',
  inaccurate: 'extracted.votes.semanticVote.inaccurate',
  like: 'extracted.votes.semanticVote.like',
  neutral: 'extracted.votes.semanticVote.neutral',
  oppose: 'extracted.votes.semanticVote.oppose',
  support: 'extracted.votes.semanticVote.support',
  vouch: 'extracted.votes.semanticVote.vouch',
} as const

interface ChoiceGroupProps {
  choices: readonly ElectionVoteChoice[]
  dataPw: string
  disabled?: boolean
  vote: ScoreVoteState
}

export interface CompactVoteProps extends ChoiceGroupProps {
  className?: string
  hideDownCount?: boolean
}

export function ChoiceGroup({ choices, dataPw, disabled, vote }: ChoiceGroupProps) {
  const t = useTranslations()
  return (
    <div
      className='space-y-2'
      data-pw='semantic-vote-choices'
      data-vote-root={dataPw}
      data-vote-control={dataPw}
    >
      <RadioGroup
        aria-label={t('extracted.votes.semanticVote.vote')}
        value={typeof vote.currentVote === 'string' ? vote.currentVote : ''}
        onValueChange={value => vote.handleVote(value as ElectionVoteChoice)}
        className='flex flex-wrap gap-2'
      >
        {choices.map(choice => (
          <Label
            key={choice}
            className='flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm'
          >
            <RadioGroupItem
              value={choice}
              disabled={disabled || vote.isLoading}
              className='disabled:opacity-100!'
              data-pw='semantic-vote-choice'
              data-vote-choice={choice}
            />
            {t(CHOICE_MESSAGE_KEYS[choice])}
          </Label>
        ))}
      </RadioGroup>
    </div>
  )
}

export function CompactVote({
  choices,
  className,
  dataPw,
  disabled,
  hideDownCount,
  vote,
}: CompactVoteProps) {
  const t = useTranslations()
  return (
    <div
      className={`flex items-center gap-2 ${className ?? ''}`}
      data-vote-root={dataPw}
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='touch'
            className='disabled:opacity-100!'
            aria-label={t('extracted.votes.semanticVote.choose')}
            disabled={disabled || vote.isLoading}
            data-pw='semantic-vote-trigger'
          >
            {typeof vote.currentVote === 'string'
              ? t(CHOICE_MESSAGE_KEYS[vote.currentVote])
              : t('extracted.votes.semanticVote.vote')}
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <ChoiceGroup
            choices={choices}
            dataPw={dataPw}
            disabled={disabled}
            vote={vote}
          />
        </PopoverContent>
      </Popover>
      <VoteCounts
        hideDownCount={hideDownCount}
        vote={vote}
      />
    </div>
  )
}

export function BinaryVote({
  choices,
  className,
  dataPw,
  disabled,
  hideDownCount,
  vote,
}: CompactVoteProps) {
  const t = useTranslations()
  return (
    <div
      className={`flex items-center gap-2 ${className ?? ''}`}
      data-vote-root={dataPw}
    >
      {choices.map(choice => (
        <Button
          key={choice}
          type='button'
          variant={vote.currentVote === choice ? 'default' : 'ghost'}
          size='touchSm'
          aria-label={t(CHOICE_MESSAGE_KEYS[choice])}
          aria-pressed={vote.currentVote === choice}
          disabled={disabled || vote.isLoading}
          onClick={() => vote.handleVote(choice)}
          data-pw='semantic-vote-binary-choice'
          data-vote-choice={choice}
        >
          {t(CHOICE_MESSAGE_KEYS[choice])}
        </Button>
      ))}
      <VoteCounts
        hideDownCount={hideDownCount}
        vote={vote}
      />
    </div>
  )
}
