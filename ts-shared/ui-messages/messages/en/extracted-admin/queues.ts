const messages = {
  queues: {
    aiAgentsSection: {
      aiAgentsDisabled_2a397abe: 'AI Agents disabled',
      aiAgentsEnabled_786b4c72: 'AI Agents enabled',
      aiAgents_d591a7cb: 'AI Agents',
      disableAiAgents_2d8b6f04: 'Disable AI Agents',
      disabled_75081b59: 'Disabled',
      enableAiAgents_4a7c9e13: 'Enable AI Agents',
      enabled_92c1cdfd: 'Enabled',
      failedToToggleAiAgents_90820208: 'Failed to toggle AI Agents',
      loading_8c3f5a92: 'Loading…',
      retryLoadingStatus_50b07fb2: 'Retry loading status',
    },
    backfillTriggerDialog: {
      cancel_19766ed6: 'Cancel',
      runBackfillDescription_502faa6e: 'Run backfill: {description}?',
      runBackfill_625fd5e1: 'Run Backfill',
      thisWillEnqueueAJobnameDispatcher_70b49fc7:
        'This will enqueue a {jobName} dispatcher job that scans {sourceTable} and enqueues individual jobs for every row missing a result. This may enqueue a large number of jobs.',
    },
    backfillsTable: {
      action_64cff131: 'Action',
      backfills_a48b0e52: 'Backfills',
      description_526e0087: 'Description',
      queue_3b2fe03e: 'Queue',
      runBackfill_625fd5e1: 'Run Backfill',
      running_4977a7e5: 'Running...',
      sourceTable_59462672: 'Source Table',
    },
    kagiSection: {
      disableKagiSmallweb_4074794b: 'Disable Kagi Smallweb',
      disabled_75081b59: 'Disabled',
      enableKagiSmallweb_9708f935: 'Enable Kagi Smallweb',
      enabled_92c1cdfd: 'Enabled',
      failedToToggleKagiSmallweb_57905ab3: 'Failed to toggle Kagi Smallweb',
      kagiSmallwebDisabled_690e9de0: 'Kagi Smallweb disabled',
      kagiSmallwebEnabled_96f7a415: 'Kagi Smallweb enabled',
      kagiSmallweb_fb55419b: 'Kagi Smallweb',
      loading_ba3bbbe1: 'Loading…',
      retryLoadingStatus_50b07fb2: 'Retry loading status',
    },
    page: {
      backfillDescriptionEnqueued_f822b605: 'Backfill "{description}" enqueued',
      failedToLoadScheduledJobs_196d47c6: 'Failed to load scheduled jobs',
      failedToTriggerBackfillDescription_677e1efb: 'Failed to trigger backfill: {description}',
      failedToTriggerDescription_f09acb12: 'Failed to trigger {description}',
      jobDescriptionTriggered_6a310e54: 'Job {description} triggered',
    },
    scheduledJobTriggerDialog: {
      cancel_19766ed6: 'Cancel',
      thisWillImmediatelyEnqueueTheJobname_2a41ab47:
        'This will immediately enqueue the {jobName} job on the {queueName} queue. This job normally runs on schedule: {schedule}.',
      triggerDescription_b56c1359: 'Trigger {description}?',
      trigger_8b9c6437: 'Trigger',
    },
    scheduledJobsHeader: {
      glideMqJobQueueManagement_4ecf9a0e: 'glide-mq job queue management',
      openGlidemqDashboard_d613ee9c: 'Open GlideMQ Dashboard',
      queues_be77db11: 'Queues',
      refresh_0e916101: 'Refresh',
      refreshing_69d2daed: 'Refreshing...',
    },
    scheduledJobsLoadState: {
      errorLoadingScheduledJobs_4c9bba2c: 'Error Loading Scheduled Jobs',
      loadingScheduledJobs_22dbad5e: 'Loading scheduled jobs...',
      queues_be77db11: 'Queues',
    },
    scheduledJobsTable: {
      action_64cff131: 'Action',
      job_ad617a0f: 'Job',
      queue_3b2fe03e: 'Queue',
      schedule_f4830a1d: 'Schedule',
      scheduledJobs_63df3f1d: 'Scheduled Jobs',
      trigger_8b9c6437: 'Trigger',
      triggering_b7f2a98c: 'Triggering...',
    },
  },
}

export default messages
