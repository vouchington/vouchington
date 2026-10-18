/** Register every CPU domain manifest on the one shared queue. */
export async function upsertBackgroundCpuSchedules(): Promise<void> {
  const [crawlDispatch, crawlReferral, crawlUnfurl, contentAnalysis, bedrock] = await Promise.all([
    import('@queues/crawl-dispatch/enqueues/schedules'),
    import('@queues/crawl-referral-links/enqueues/schedules'),
    import('@queues/unfurl-referral-links/enqueues/schedules'),
    import('@queues/content-analysis/enqueues/schedules'),
    import('@queues/bedrock-embeddings-batch/enqueues/schedules'),
  ])
  await crawlDispatch.upsertSchedules()
  await crawlReferral.upsertSchedules()
  await crawlUnfurl.upsertSchedules()
  await contentAnalysis.upsertSchedules()
  await bedrock.upsertSchedules()
}
