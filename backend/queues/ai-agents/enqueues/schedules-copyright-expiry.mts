import type { JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '../config.mts'
import {
  enqueueExpireStuckCopyrightAppealRuns,
  enqueueExpireStuckCopyrightEmailRuns,
  enqueueExpireStuckCopyrightGuidanceRuns,
} from './expire-stuck-resolution-runs.mts'

function options(name: keyof typeof AGENT_PRIORITY): JobOptions {
  return {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY[name],
  }
}

/** Fail copyright AI runs left active after a crash or terminal stall, so the next dispatch sweep admits a new run. */
export const copyrightExpiryScheduledJobs = [
  {
    schedulerId: 'expireStuckCopyrightEmailRuns',
    repeat: { pattern: '7 * * * *' },
    template: {
      name: 'expire-stuck-copyright-email-runs',
      data: {},
      opts: () => options('expire-stuck-copyright-email-runs'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'expireStuckCopyrightEmailRuns',
        schedule: '7 * * * *',
        description: 'Fail copyright email intake runs left active after a crash or terminal stall',
        trigger: enqueueExpireStuckCopyrightEmailRuns,
      },
    ],
  },
  {
    schedulerId: 'expireStuckCopyrightAppealRuns',
    repeat: { pattern: '27 * * * *' },
    template: {
      name: 'expire-stuck-copyright-appeal-runs',
      data: {},
      opts: () => options('expire-stuck-copyright-appeal-runs'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'expireStuckCopyrightAppealRuns',
        schedule: '27 * * * *',
        description:
          'Fail copyright appeal recommendation runs left active after a crash or terminal stall',
        trigger: enqueueExpireStuckCopyrightAppealRuns,
      },
    ],
  },
  {
    schedulerId: 'expireStuckCopyrightGuidanceRuns',
    repeat: { pattern: '57 * * * *' },
    template: {
      name: 'expire-stuck-copyright-guidance-runs',
      data: {},
      opts: () => options('expire-stuck-copyright-guidance-runs'),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'expireStuckCopyrightGuidanceRuns',
        schedule: '57 * * * *',
        description:
          'Fail copyright submission guidance runs left active after a crash or terminal stall',
        trigger: enqueueExpireStuckCopyrightGuidanceRuns,
      },
    ],
  },
] as const
