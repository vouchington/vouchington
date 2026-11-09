import { registerScenarioContract } from '../plan-expectations.mts'
import { RERUN_OUTCOME_SEEDED_RUN_COUNT } from '../seed-data/moderation-rerun-outcomes.mts'
import { MODERATION_RERUN_SCENARIO_IDS } from '../moderation-rerun-scenario-ids.mts'

type ScenarioId = (typeof MODERATION_RERUN_SCENARIO_IDS)[number]

export function registerModerationRerunScenario(id: ScenarioId, maxProcessedRows = 3): void {
  registerScenarioContract(id, {
    seededRows: {
      moderation_report_judgement_runs: RERUN_OUTCOME_SEEDED_RUN_COUNT,
      moderation_appeal_resolution_runs: RERUN_OUTCOME_SEEDED_RUN_COUNT,
    },
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'moderation_report_judgement_runs',
        max: maxProcessedRows,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'moderation_appeal_resolution_runs',
        max: maxProcessedRows,
      },
      { kind: 'maxProcessedRows', relation: 'moderation_report_judgements', max: maxProcessedRows },
      { kind: 'maxProcessedRows', relation: 'moderation_appeals', max: maxProcessedRows },
    ],
    forbidSequentialScans: [
      'moderation_report_judgement_runs',
      'moderation_appeal_resolution_runs',
    ],
  })
}
