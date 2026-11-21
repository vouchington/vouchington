import { COPYRIGHT_AGENT_DISPATCH_STAGES } from '@queues/ai-agents/enqueues/copyright-agent-dispatch-stages'
import { COPYRIGHT_ACTION_RECONCILE_STAGES } from '@queues/background/enqueues/notifications-domain'
import { copyrightAgentDispatchLimitFields } from '@services/copyright-notices/work-limits'

const stageJobs: [prefix: string, job: string][] = [
  ...COPYRIGHT_ACTION_RECONCILE_STAGES.map((stage): [string, string] => [
    stage,
    `${stage} action reconcile`,
  ]),
  ...COPYRIGHT_AGENT_DISPATCH_STAGES.map((stage): [string, string] => [
    copyrightAgentDispatchLimitFields[stage],
    `${stage} agent dispatch`,
  ]),
]

/** The page size and page cap of every copyright reconcile and agent dispatch stage job. */
export const copyrightStageLimitFields = Object.fromEntries(
  stageJobs.flatMap(([prefix, job]) => [
    [
      `${prefix}_batch_size`,
      {
        description: `Maximum rows per page of the ${job} job.`,
        minValue: 1,
        maxValue: 100,
        integer: true,
      },
    ],
    [
      `${prefix}_max_batches_per_run`,
      {
        description: `Maximum pages per run of the ${job} job; remaining work continues in its own job.`,
        minValue: 1,
        maxValue: 2000,
        integer: true,
      },
    ],
  ]),
)
