/** Each pending-dispatch kind is swept by its own job, so no stage shares a cursor, cap or error list. */
export const COPYRIGHT_AGENT_DISPATCH_STAGES = [
  'email',
  'form-screening',
  'form-effect',
  'appeal',
  'submission-guidance',
] as const
export type CopyrightAgentDispatchStage = (typeof COPYRIGHT_AGENT_DISPATCH_STAGES)[number]

/** One lane bounds the load of every copyright agent dispatch sweep stage together. */
export const COPYRIGHT_AGENT_DISPATCH_ORDERING = {
  key: 'copyright_agent_dispatch_reconcile',
  concurrency: 1,
} as const

export const COPYRIGHT_AGENT_DISPATCH_JOBS = {
  email: {
    jobName: 'reconcile-copyright-email-dispatches',
    schedulerId: 'reconcileCopyrightEmailDispatches',
    description: 'Re-enqueue unassessed copyright email agent work',
  },
  'form-screening': {
    jobName: 'reconcile-copyright-form-screening-dispatches',
    schedulerId: 'reconcileCopyrightFormScreeningDispatches',
    description: 'Re-enqueue unscreened copyright form agent work',
  },
  'form-effect': {
    jobName: 'reconcile-copyright-form-effect-dispatches',
    schedulerId: 'reconcileCopyrightFormEffectDispatches',
    description: 'Apply saved copyright form screening effects without an agent run',
  },
  appeal: {
    jobName: 'reconcile-copyright-appeal-dispatches',
    schedulerId: 'reconcileCopyrightAppealDispatches',
    description: 'Re-enqueue unassessed copyright appeal recommendation work',
  },
  'submission-guidance': {
    jobName: 'reconcile-copyright-submission-guidance-dispatches',
    schedulerId: 'reconcileCopyrightSubmissionGuidanceDispatches',
    description: 'Re-enqueue unassessed copyright submission guidance work',
  },
} as const satisfies Record<
  CopyrightAgentDispatchStage,
  { jobName: string; schedulerId: string; description: string }
>

export type CopyrightAgentDispatchJobName =
  (typeof COPYRIGHT_AGENT_DISPATCH_JOBS)[CopyrightAgentDispatchStage]['jobName']
