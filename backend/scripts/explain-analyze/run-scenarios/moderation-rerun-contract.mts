import { registerScenarioContract } from '../plan-expectations.mts'
import { RERUN_OUTCOME_COHORT_SIZE } from '../seed-data/moderation-rerun-outcomes.mts'
import { MODERATION_RERUN_SCENARIO_IDS } from '../moderation-rerun-scenario-ids.mts'

type ScenarioId = (typeof MODERATION_RERUN_SCENARIO_IDS)[number]

export function registerModerationRerunScenario(id: ScenarioId): void {
  registerScenarioContract(id, {
    seededRows: {
      moderation_report_judgement_runs: RERUN_OUTCOME_COHORT_SIZE,
      moderation_appeal_resolution_runs: RERUN_OUTCOME_COHORT_SIZE,
    },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'moderation_report_judgement_runs', max: 3 },
      { kind: 'maxProcessedRows', relation: 'moderation_appeal_resolution_runs', max: 3 },
      { kind: 'maxProcessedRows', relation: 'moderation_report_judgements', max: 3 },
      { kind: 'maxProcessedRows', relation: 'moderation_appeals', max: 3 },
    ],
    forbidSequentialScans: [
      'moderation_report_judgement_runs',
      'moderation_appeal_resolution_runs',
    ],
  })
}
