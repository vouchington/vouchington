'use client'

import { Badge } from '@/components/ui/badge'
import { PostContentText } from '@/components/posts/post-content-text'
import type { CommunityAutomodSimulation } from '@/lib/api/client/community-agent-prompts'
import { formatNumber, formatPercent } from '@ts-shared/utils/format'
import { CommunityAgentPromptSimulationMetric as Metric } from './community-agent-prompt-simulation-metric'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CommunityAgentPromptTestResults({
  simulation,
  flaggedResults,
  uiLocale,
}: {
  simulation: CommunityAutomodSimulation
  flaggedResults: CommunityAutomodSimulation['results']
  uiLocale: string
}) {
  const t = useTranslations()
  return (
    <div
      className='space-y-3'
      data-pw='community-agent-prompt-test-results'
    >
      <dl className='grid gap-x-6 gap-y-2 sm:grid-cols-4'>
        <Metric
          label='Sample'
          value={formatNumber(simulation.simulation.sample_count, uiLocale)}
        />
        <Metric
          label='Flags'
          value={formatNumber(simulation.simulation.would_flag_count, uiLocale)}
        />
        <Metric
          label='Removals'
          value={formatNumber(simulation.simulation.would_unpublish_count, uiLocale)}
        />
        <Metric
          label='Historical FP'
          value={
            simulation.simulation.false_positive_estimate?.rate == null
              ? 'n/a'
              : formatPercent(simulation.simulation.false_positive_estimate.rate)
          }
        />
      </dl>
      {flaggedResults.length === 0 ? (
        <p
          className='text-sm text-muted-foreground'
          data-pw='community-agent-prompt-test-empty'
        >
          {t('extracted.communities.communityAgentPromptTestPanel.noProjectedMatches_713caf31')}
        </p>
      ) : (
        <div className='divide-y'>
          {flaggedResults.map(result => (
            <div
              key={result.post_id}
              className='space-y-1 py-3 first:pt-0 last:pb-0'
              data-pw='community-agent-prompt-test-result'
            >
              <div className='flex flex-wrap items-center gap-2'>
                <PostContentText
                  as='p'
                  className='min-w-0 flex-1 truncate text-sm font-medium'
                  content={{
                    text: result.title,
                    declared_language: result.declared_language,
                    lingua_rs_detected_language: result.lingua_rs_detected_language,
                  }}
                />
                <Badge variant='outline'>{result.would_unpublish ? 'Would remove' : 'Flag'}</Badge>
              </div>
              <PostContentText
                as='p'
                className='line-clamp-2 text-xs text-muted-foreground'
                content={{
                  text: result.content_excerpt,
                  declared_language: result.declared_language,
                  lingua_rs_detected_language: result.lingua_rs_detected_language,
                }}
              />
              {result.reason ? <p className='text-sm'>{result.reason}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
