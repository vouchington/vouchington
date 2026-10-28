export type EngineeringQueueEndpointContext = Pick<
  typeof import('@/lib/api/client/mq'),
  | 'fetchBackfills'
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
