import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import type { CopyrightActionReconcileStage } from '@queues/notifications/types'
import type { CopyrightAgentDispatchStage } from '@queues/ai-agents/enqueues/copyright-agent-dispatch-stages'

const additionalDefaults = {
  delivery_lease_minutes: 15,
  screening_lease_minutes: 15,
}
export const copyrightNoticesAdditionalMaxValues = {
  delivery_lease_minutes: 360,
  screening_lease_minutes: 360,
  association_search_candidate_rows: 1000,
}

export const copyrightSweepConfig = new DynamicConfig({
  key: 'copyright-notices-work-config',
  fieldTypes: {
    batch_size: 'number',
    max_batches_per_run: 'number',
    delivery_lease_minutes: 'number',
    screening_lease_minutes: 'number',
    association_search_candidate_rows: 'number',
    forms_batch_size: 'number',
    forms_max_batches_per_run: 'number',
    decisions_batch_size: 'number',
    decisions_max_batches_per_run: 'number',
    enforcement_batch_size: 'number',
    enforcement_max_batches_per_run: 'number',
    suspended_batch_size: 'number',
    suspended_max_batches_per_run: 'number',
    blocked_batch_size: 'number',
    blocked_max_batches_per_run: 'number',
    restorations_batch_size: 'number',
    restorations_max_batches_per_run: 'number',
    actions_batch_size: 'number',
    actions_max_batches_per_run: 'number',
    agent_email_batch_size: 'number',
    agent_email_max_batches_per_run: 'number',
    agent_form_screening_batch_size: 'number',
    agent_form_screening_max_batches_per_run: 'number',
    agent_form_effect_batch_size: 'number',
    agent_form_effect_max_batches_per_run: 'number',
    agent_appeal_batch_size: 'number',
    agent_appeal_max_batches_per_run: 'number',
    agent_submission_guidance_batch_size: 'number',
    agent_submission_guidance_max_batches_per_run: 'number',
  },
  defaultFields: {
    batch_size: 100,
    max_batches_per_run: 20,
    association_search_candidate_rows: 100,
    forms_batch_size: 100,
    forms_max_batches_per_run: 20,
    decisions_batch_size: 100,
    decisions_max_batches_per_run: 20,
    enforcement_batch_size: 100,
    enforcement_max_batches_per_run: 20,
    suspended_batch_size: 100,
    suspended_max_batches_per_run: 20,
    blocked_batch_size: 100,
    blocked_max_batches_per_run: 20,
    restorations_batch_size: 100,
    restorations_max_batches_per_run: 20,
    actions_batch_size: 100,
    actions_max_batches_per_run: 20,
    agent_email_batch_size: 100,
    agent_email_max_batches_per_run: 20,
    agent_form_screening_batch_size: 100,
    agent_form_screening_max_batches_per_run: 20,
    agent_form_effect_batch_size: 100,
    agent_form_effect_max_batches_per_run: 20,
    agent_appeal_batch_size: 100,
    agent_appeal_max_batches_per_run: 20,
    agent_submission_guidance_batch_size: 100,
    agent_submission_guidance_max_batches_per_run: 20,
    ...additionalDefaults,
  },
})

/** Bound the id-ordered candidate window before evaluating staff notice search text. */
export function getCopyrightAssociationSearchCandidateRows(): number {
  return getBoundedPositiveIntegerField(copyrightSweepConfig, 'association_search_candidate_rows', {
    defaultValue: 100,
    maxValue: copyrightNoticesAdditionalMaxValues.association_search_candidate_rows,
  })
}

/** The page size and page cap of one action reconcile stage, or of the other copyright sweeps. */
export function getCopyrightSweepLimits(stage?: CopyrightActionReconcileStage) {
  return {
    batchSize: getBoundedPositiveIntegerField(
      copyrightSweepConfig,
      stage ? `${stage}_batch_size` : 'batch_size',
      { defaultValue: 100, maxValue: 100 },
    ),
    maxBatches: getBoundedPositiveIntegerField(
      copyrightSweepConfig,
      stage ? `${stage}_max_batches_per_run` : 'max_batches_per_run',
      { defaultValue: 20, maxValue: 2000 },
    ),
  }
}

/** Config field prefix of each agent dispatch stage's own page size and page cap. */
export const copyrightAgentDispatchLimitFields = {
  email: 'agent_email',
  'form-screening': 'agent_form_screening',
  'form-effect': 'agent_form_effect',
  appeal: 'agent_appeal',
  'submission-guidance': 'agent_submission_guidance',
} as const satisfies Record<CopyrightAgentDispatchStage, string>

/** The page size and page cap of one copyright agent dispatch stage. */
export function getCopyrightAgentDispatchLimits(stage: CopyrightAgentDispatchStage) {
  const prefix = copyrightAgentDispatchLimitFields[stage]
  return {
    batchSize: getBoundedPositiveIntegerField(copyrightSweepConfig, `${prefix}_batch_size`, {
      defaultValue: 100,
      maxValue: 100,
    }),
    maxBatches: getBoundedPositiveIntegerField(
      copyrightSweepConfig,
      `${prefix}_max_batches_per_run`,
      { defaultValue: 20, maxValue: 2000 },
    ),
  }
}

export function getCopyrightNoticesWorkLimit(field: keyof typeof additionalDefaults): number {
  return getBoundedPositiveIntegerField(copyrightSweepConfig, field, {
    defaultValue: additionalDefaults[field],
    maxValue: copyrightNoticesAdditionalMaxValues[field],
  })
}
