export type EngineeringQueueEndpointContext = Pick<
  typeof import('@/lib/api/client/mq'),
  | 'fetchBackfills'
  | 'fetchQueueStats'
  | 'fetchQueueDomains'
  | 'pauseQueueDomain'
  | 'resumeQueueDomain'
  | 'retryFailedDomainJobs'
  | 'fetchQueues'
  | 'fetchScheduledJobs'
  | 'pauseQueue'
  | 'resumeQueue'
  | 'triggerBackfill'
  | 'triggerScheduledJob'
>
