import type { Topic, TopicElection } from '@/types/topics'
import type { Translator } from '@ts-shared/ui-messages'

interface VoteCardProps {
  topic: Topic
  election?: TopicElection | null
  t: Translator
}

export function VoteCard({ topic, election, t }: VoteCardProps) {
  const countUp = election?.votes_count_up ?? 0
  const countDown = election?.votes_count_down ?? 0

  return (
    <div className='rounded-md border bg-card p-2 sm:p-4'>
      <h3 className='font-semibold'>{topic.name}</h3>
      <div className='mt-2 space-y-1 text-sm'>
        <div className='flex justify-between'>
          <span className='text-muted-foreground'>
            {t('extracted.votes.semanticVote.positiveVotes', { count: countUp })}
          </span>
          <span className='font-medium text-emerald-600'>+{countUp}</span>
        </div>
        <div className='flex justify-between'>
          <span className='text-muted-foreground'>
            {t('extracted.votes.semanticVote.negativeVotes', { count: countDown })}
          </span>
          <span className='font-medium text-rose-600'>-{countDown}</span>
        </div>
      </div>
    </div>
  )
}
