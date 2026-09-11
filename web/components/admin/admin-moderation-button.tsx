'use client'

import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScoreVote } from '@/components/votes/score-vote'
import { formatPercent } from '@ts-shared/utils/format'
import { clearAgentModerationVote, submitAgentModerationVote } from '@/lib/api/client/elections'
import type { AgentModeration, AgentModerationElection, AgentModerationVote } from '@/types/agents'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AdminModerationButtonProps {
  moderations: AgentModeration[]
  elections?: Record<string, AgentModerationElection>
  electionVotes?: Record<string, AgentModerationVote>
}

export default function AdminModerationButton({
  moderations,
  elections,
  electionVotes,
}: AdminModerationButtonProps) {
  const t = useTranslations()
  const hasFlagged = moderations.some(m => m.flagged)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          className={`h-auto min-h-[44px] w-auto px-2 text-xs hover:underline ${hasFlagged ? 'text-destructive' : 'text-muted-foreground'}`}
          // oxlint-disable-next-line no-mistakes/playwright-literals -- conditional button based on state
          data-pw={hasFlagged ? 'admin-moderation-flagged-trigger' : 'admin-moderation-trigger'}
        >
          <Shield className='h-3 w-3' />
          {hasFlagged ? 'Flagged' : 'Moderation'}
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle data-pw='moderation-results-title'>
            {t('extracted.admin.adminModerationButton.moderationResults_64be347a')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('extracted.admin.adminModerationButton.viewModerationResultsAndVoteOn_16433172')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3 overflow-auto max-h-96'>
          {moderations.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('extracted.admin.adminModerationButton.noModerationResults_06b3b075')}
            </p>
          ) : (
            moderations.map(m => {
              const election = elections?.[m.id]
              return (
                <div
                  key={`${m.input_sha256}-${m.prompt_id}`}
                  className={`rounded border p-3 text-sm ${m.flagged ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}
                >
                  <div className='flex items-center justify-between gap-2 mb-1'>
                    <span className='font-medium'>{m.moderator_slug ?? m.agent_id}</span>
                    <span
                      className={`text-xs font-semibold ${m.flagged ? 'text-destructive' : 'text-green-600'}`}
                    >
                      {m.flagged ? 'Flagged' : 'OK'}
                    </span>
                  </div>
                  <p
                    className='text-muted-foreground'
                    data-pw='moderation-reason'
                  >
                    {m.results.reason}
                  </p>
                  {hasConfidenceMetadata(m.results) ? (
                    <p
                      className='mt-1 text-xs text-muted-foreground'
                      data-pw='moderation-confidence'
                    >
                      {t(
                        'extracted.admin.adminModerationButton.confidenceConfidencescoreVsThresholdConfidencethreshold_19d5ea3a',
                        {
                          confidenceScore: formatPercent(m.results.confidence_score),
                          confidenceThreshold: formatPercent(m.results.confidence_threshold),
                        },
                      )}
                      {m.results.detector ? (
                        <>
                          {' '}
                          {t('extracted.admin.adminModerationButton.viaDetector_936b0aaf', {
                            detector: m.results.detector,
                          })}
                        </>
                      ) : (
                        ''
                      )}
                    </p>
                  ) : null}
                  {election ? (
                    <div className='mt-2'>
                      <ScoreVote
                        entityType='agent_moderation'
                        electionId={election.id}
                        countUp={election.votes_count_up ?? 0}
                        countDown={election.votes_count_down ?? 0}
                        existingVoteChoice={
                          electionVotes?.[m.id]?.choice as
                            | import('@/lib/api/client/elections').ModerationChoice
                            | undefined
                        }
                        policy='moderation'
                        submitVote={(id, choice) =>
                          submitAgentModerationVote(
                            id,
                            choice as import('@/lib/api/client/elections').ModerationChoice,
                          )
                        }
                        clearVote={clearAgentModerationVote}
                        allowOfficialAccounts
                      />
                    </div>
                  ) : null}
                  <p
                    className='text-xs text-muted-foreground mt-1'
                    suppressHydrationWarning
                  >
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function hasConfidenceMetadata(
  results: AdminModerationButtonProps['moderations'][number]['results'],
): results is AdminModerationButtonProps['moderations'][number]['results'] & {
  confidence_score: number
  confidence_threshold: number
} {
  return Number.isFinite(results.confidence_score) && Number.isFinite(results.confidence_threshold)
}
