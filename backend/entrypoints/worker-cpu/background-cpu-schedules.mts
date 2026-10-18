import { upsertBackgroundCpuSchedules as upsertBackgroundCpuSchedulesOnQueue } from '@queues/background-cpu/enqueues/schedules'

export async function loadBackgroundCpuScheduleManifests() {
  const [crawlDispatch, crawlReferral, crawlUnfurl, contentAnalysis, bedrock] = await Promise.all([
    import('@queues/crawl-dispatch/enqueues/schedules'),
    import('@queues/crawl-referral-links/enqueues/schedules'),
    import('@queues/unfurl-referral-links/enqueues/schedules'),
    import('@queues/content-analysis/enqueues/schedules'),
    import('@queues/bedrock-embeddings-batch/enqueues/schedules'),
  ])
  return [
    crawlDispatch.scheduledJobManifest,
    crawlReferral.scheduledJobManifest,
    crawlUnfurl.scheduledJobManifest,
    contentAnalysis.scheduledJobManifest,
    bedrock.scheduledJobManifest,
  ]
}

export async function upsertBackgroundCpuSchedules(): Promise<void> {
  await upsertBackgroundCpuSchedulesOnQueue(await loadBackgroundCpuScheduleManifests())
}
