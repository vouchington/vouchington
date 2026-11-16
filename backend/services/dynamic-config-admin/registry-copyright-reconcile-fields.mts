import {
  COPYRIGHT_ACTION_RECONCILE_STAGES,
  COPYRIGHT_DELIVERY_RECONCILE_CHANNELS,
} from '@queues/background/enqueues/notifications-domain'

/** The page size and page cap fields of every copyright reconcile job, each with its own limits. */
export const copyrightReconcileJobFields = Object.fromEntries(
  [
    ...COPYRIGHT_ACTION_RECONCILE_STAGES.map(stage => [stage, 'action'] as const),
    ...COPYRIGHT_DELIVERY_RECONCILE_CHANNELS.map(channel => [channel, 'delivery'] as const),
  ].flatMap(([name, kind]) => [
    [
      `${name}_batch_size`,
      {
        description: `Maximum rows per page of the ${name} ${kind} reconcile job.`,
        minValue: 1,
        maxValue: 100,
        integer: true,
      },
    ],
    [
      `${name}_max_batches_per_run`,
      {
        description: `Maximum pages per run of the ${name} ${kind} reconcile job; remaining work continues in its own job.`,
        minValue: 1,
        maxValue: 2000,
        integer: true,
      },
    ],
  ]),
)
