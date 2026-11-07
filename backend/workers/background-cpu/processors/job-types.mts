import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'

export type CpuJob = NamedQueueJob<BackgroundCpuJobPayloads>
export type LanguageBackfillJob = Extract<CpuJob, { name: `content-analysis.backfill_${string}` }>
export type LanguageDetectionJob = Extract<
  CpuJob,
  {
    name:
      | 'content-analysis.post'
      | 'content-analysis.rss_feed_item'
      | 'content-analysis.crawl'
      | 'content-analysis.community'
      | 'content-analysis.user'
      | 'content-analysis.topic'
  }
>
