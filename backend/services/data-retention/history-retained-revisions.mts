import { DEFAULT_DATA_RETENTION_CONFIG, readDataRetentionField } from './config.mts'

/** Admins may only raise these counts; lowering would delete history that cannot be recovered. */
export function getConfigHistoryRetainedRevisions(): number {
  return Math.max(
    DEFAULT_DATA_RETENTION_CONFIG.config_history_retained_revisions_per_key,
    readDataRetentionField('config_history_retained_revisions_per_key'),
  )
}

export function getAgentPromptHistoryRetainedRevisions(): number {
  return Math.max(
    DEFAULT_DATA_RETENTION_CONFIG.agent_prompt_history_retained_revisions_per_community,
    readDataRetentionField('agent_prompt_history_retained_revisions_per_community'),
  )
}
