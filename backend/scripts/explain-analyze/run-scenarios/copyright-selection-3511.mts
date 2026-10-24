import { getPendingCopyrightAgentDispatches } from '@services/copyright-notices/reconcile-agent-dispatches'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runCopyrightSelection3511Scenario(): Promise<void> {
  registerScenarioContract('copyright-agent-dispatch-due', {
    seededRows: {
      copyright_notice_email_intakes: 10000,
      copyright_notice_email_intake_parses: 10000,
    },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_copyright_notice_email_intake_parses__succeeded_intake'],
      },
      { kind: 'maxProcessedRows', relation: 'copyright_notice_email_intake_parses', max: 200 },
    ],
  })
  await runAndCapture('copyright-agent-dispatch-due', async () => {
    const page = await getPendingCopyrightAgentDispatches({ limit: 10 })
    if (page.results.length !== 10 || page.results.filter(item => item.kind === 'email').length < 9)
      throw new Error('Expected the sparse pending copyright email dispatch tail')
  })
}
