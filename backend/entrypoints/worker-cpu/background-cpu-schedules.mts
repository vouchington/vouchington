import { upsertBackgroundCpuSchedules as upsertBackgroundCpuSchedulesOnQueue } from '@queues/background-cpu/enqueues/schedules'
import type { ScheduledJobQueue } from '@vouchington/worker-runtime/schedule-manifest'

async function loadBackgroundCpuScheduleManifests() {
  const [crawlDispatch, crawlReferral, crawlUnfurl, contentAnalysis, gemini] = await Promise.all([
    import('@queues/crawl-dispatch/enqueues/schedules'),
    import('@queues/crawl-referral-links/enqueues/schedules'),
    import('@queues/unfurl-referral-links/enqueues/schedules'),
    import('@queues/content-analysis/enqueues/schedules'),
    import('@queues/gemini-embeddings-batch/enqueues/schedules'),
  ])
  return [
    crawlDispatch.scheduledJobManifest,
    crawlReferral.scheduledJobManifest,
    crawlUnfurl.scheduledJobManifest,
    contentAnalysis.scheduledJobManifest,
    gemini.scheduledJobManifest,
  ]
}

export async function upsertBackgroundCpuSchedules(queue?: ScheduledJobQueue): Promise<void> {
  await upsertBackgroundCpuSchedulesOnQueue(await loadBackgroundCpuScheduleManifests(), queue)
}
