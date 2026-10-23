import {
  advanceGooglePlayActiveSourceRecoveryCursor,
  findRecoverableGooglePlayActiveSourceJobs,
} from '@services/memberships/google/active-source-recovery'
import { membershipWorkConfig } from '@services/memberships/work-limits'
import { findRecoverableMicrosoftStoreSourceJobs } from '@services/memberships/microsoft/source-recovery'
import { write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runProviderSourceSelection3511Scenarios(): Promise<void> {
  const seededRows = {
    membership_provider_contexts: 4,
    membership_sources: 20000,
    membership_source_states: 20000,
    membership_provider_lineages: 30000,
    membership_products: 5,
    membership_google_play_purchase_tokens: 10000,
    membership_microsoft_store_credentials: 10000,
  }
  const assertGoogleRawPage = async () => {
    const page = await findRecoverableGooglePlayActiveSourceJobs()
    if (page.sourceIds.length !== 5 || !page.nextCursor || page.completesSweep)
      throw new Error('Expected five live Google sources in the first 500 scanned IDs')
  }
  registerScenarioContract('google-active-source-recovery-raw-page', {
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['membership_sources_pkey'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'membership_sources', max: 501 },
    ],
  })
  await runAndCapture(
    'google-active-source-recovery-raw-page',
    assertGoogleRawPage,
    undefined,
    'findGooglePlayActiveSourceRecoveryBatch.sources',
  )

  registerScenarioContract('google-active-source-recovery-due', {
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_membership_source_states__active_direct_recovery'] },
      { kind: 'maxProcessedRows', relation: 'membership_source_states', max: 200 },
    ],
  })
  await runAndCapture(
    'google-active-source-recovery-due',
    assertGoogleRawPage,
    undefined,
    'findGooglePlayActiveSourceRecoveryBatch.eligible',
  )

  registerScenarioContract('google-active-source-recovery-empty-page', {
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['membership_sources_pkey'], noSort: true },
      // Generic planning may filter the preceding cursor row after the index probe.
      { kind: 'maxProcessedRows', relation: 'membership_sources', max: 3 },
    ],
  })
  await runAndCapture(
    'google-active-source-recovery-empty-page',
    async () => {
      const previousPageSize = membershipWorkConfig.fields.get('source_recovery_batch_size')
      membershipWorkConfig.fields.set('source_recovery_batch_size', 1)
      try {
        await write(`/* resetGooglePlayActiveSourceRecoveryProbe */
          INSERT INTO membership_google_play_recovery_cursors
            (recovery_sweep, cursor_evidence_id, sweep_upper_bound_evidence_id)
          VALUES ('active_sources', NULL, NULL)
          ON CONFLICT (recovery_sweep) DO UPDATE
          SET cursor_evidence_id = NULL, sweep_upper_bound_evidence_id = NULL`)
        const emptyPage = await findRecoverableGooglePlayActiveSourceJobs()
        if (
          emptyPage.scannedCount !== 1 ||
          emptyPage.sourceIds.length !== 0 ||
          !emptyPage.nextCursor ||
          emptyPage.completesSweep
        )
          throw new Error('Expected one ineligible raw source and a resumable cursor')
        if (!(await advanceGooglePlayActiveSourceRecoveryCursor(emptyPage)))
          throw new Error('Expected empty page cursor advance to commit')
        const nextPage = await findRecoverableGooglePlayActiveSourceJobs()
        if (nextPage.previousCursor !== emptyPage.nextCursor || nextPage.scannedCount !== 1)
          throw new Error('Expected recovery to resume after an empty eligible page')
      } finally {
        if (previousPageSize === undefined)
          membershipWorkConfig.fields.delete('source_recovery_batch_size')
        else membershipWorkConfig.fields.set('source_recovery_batch_size', previousPageSize)
        await write(`/* resetGooglePlayActiveSourceRecoveryProbe */
          UPDATE membership_google_play_recovery_cursors
          SET cursor_evidence_id = NULL, sweep_upper_bound_evidence_id = NULL
          WHERE recovery_sweep = 'active_sources'`)
      }
    },
    undefined,
    'findGooglePlayActiveSourceRecoveryBatch.sources',
  )

  registerScenarioContract('microsoft-source-recovery-due', {
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_microsoft_store_credentials__unexpired_collections'] },
      { kind: 'maxProcessedRows', relation: 'membership_microsoft_store_credentials', max: 200 },
    ],
  })
  await runAndCapture(
    'microsoft-source-recovery-due',
    async () => {
      const page = await findRecoverableMicrosoftStoreSourceJobs()
      if (page.sourceIds.length !== 100)
        throw new Error('Expected 100 live Microsoft Store sources')
    },
    undefined,
    'findRecoverableMicrosoftStoreSourceJobs.sources',
  )
}
