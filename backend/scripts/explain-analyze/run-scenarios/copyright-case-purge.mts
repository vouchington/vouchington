import { beginTransaction, read } from '@data-stores/psql'
import assert from 'node:assert/strict'
import {
  copyrightCasePurgeAdmissionStatement,
  copyrightResidualRecoveryStatement,
} from '@services/copyright-notices/retention-case-purge-admission'
import { verifyCopyrightCaseChildPage } from '@services/copyright-notices/retention-case-purge-children'
import { eraseCopyrightCaseEvidencePage } from '@services/copyright-notices/retention-case-purge-evidence'
import { copyrightCasePurgeEligibilitySql } from '@services/copyright-notices/retention-case-purge-eligibility'
import { COPYRIGHT_CASE_PURGE_PHASES } from '@services/copyright-notices/retention-case-purge-order'
import { copyrightCasePurgeProofSql } from '@services/copyright-notices/retention-case-purge-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedPurgeCases } from '../seed-data/copyright-case-purge.mts'

const PAGE = 25
const LEGAL_ACTIVITY_INDEX = 'idx_copyright_notices__legal_activity'

export async function runCopyrightCasePurgeScenarios(): Promise<void> {
  const dueId = await seedPurgeCases()
  registerScenarioContract('copyright-case-purge-admission', {
    expectations: [
      { kind: 'usesIndexes', indexes: [LEGAL_ACTIVITY_INDEX], noSort: true },
      { kind: 'maxProcessedRows', relation: 'copyright_notices', max: PAGE },
    ],
    seededRows: { copyright_notices: 700 },
  })
  await runAndCapture(
    'copyright-case-purge-admission',
    async () => {
      const { rows } = await read<{ id: string }>(
        copyrightCasePurgeAdmissionStatement(undefined, PAGE),
      )
      assert.ok(
        rows.some(row => row.id === dueId),
        'The due case must be admitted',
      )
      assert.ok(rows.length <= PAGE)
    },
    undefined,
    'admitCopyrightCasePurgePage',
  )

  registerScenarioContract('copyright-case-purge-residual-recovery', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_retained_copyright_notice_identities_residual'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'retained_copyright_notice_identities', max: PAGE },
    ],
    seededRows: { retained_copyright_notice_identities: 20_000 },
  })
  await runAndCapture(
    'copyright-case-purge-residual-recovery',
    async () => {
      const { rows } = await read<{ id: string }>(
        copyrightResidualRecoveryStatement(undefined, PAGE),
      )
      assert.ok(rows.length <= PAGE)
    },
    undefined,
    'admitCopyrightResidualCaseRecoveryPage',
  )

  registerScenarioContract('copyright-case-purge-eligibility', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'copyright_notices', max: 1 }],
  })
  await runAndCapture(
    'copyright-case-purge-eligibility',
    async () => {
      const { rows } = await read<{ id: string }>(copyrightCasePurgeEligibilitySql(dueId))
      assert.equal(rows[0]?.id, dueId)
    },
    undefined,
    'readCopyrightCasePurgeEligibility',
  )

  registerScenarioContract('copyright-case-purge-proof', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'copyright_notices', max: 1 }],
  })
  await runAndCapture(
    'copyright-case-purge-proof',
    async () => {
      await using transaction = await beginTransaction()
      const { rows } = await transaction<{ id: string }>(copyrightCasePurgeProofSql(dueId, true))
      await transaction.rollback()
      assert.equal(rows[0]?.id, dueId)
    },
    undefined,
    'readCopyrightCasePurgeProof',
  )

  registerScenarioContract('copyright-case-purge-evidence-reads', {
    expectations: [],
    seededRows: {
      copyright_notice_evidence_artifacts: 100,
      copyright_notice_email_intake_notice_links: 100,
    },
  })
  await runAndCapture(
    'copyright-case-purge-evidence-reads',
    async () => {
      await using transaction = await beginTransaction()
      const artifacts = await eraseCopyrightCaseEvidencePage(
        transaction,
        dueId,
        0,
        null,
        undefined,
        10,
      )
      const emails = await eraseCopyrightCaseEvidencePage(
        transaction,
        dueId,
        1,
        null,
        undefined,
        10,
      )
      await transaction.rollback()
      assert.equal(artifacts.nextSourceIndex, 1)
      assert.equal(emails.nextSourceIndex, 2)
    },
    undefined,
    ['readCopyrightCaseEvidenceArtifact', 'readCopyrightCaseEmailEvidence'],
  )

  const nested = COPYRIGHT_CASE_PURGE_PHASES.findIndex(([, path]) => path.length > 1)
  const direct = COPYRIGHT_CASE_PURGE_PHASES.findIndex(([, path]) => path.length === 1)
  assert.ok(nested >= 0 && direct >= 0, 'The purge needs a nested and a direct child path')
  registerScenarioContract('copyright-case-purge-ancestor', { expectations: [] })
  await runAndCapture(
    'copyright-case-purge-ancestor',
    async () => {
      await using transaction = await beginTransaction()
      await verifyCopyrightCaseChildPage(transaction, dueId, nested, undefined, PAGE)
      await transaction.rollback()
    },
    undefined,
    'selectCopyrightCasePurgeAncestor',
  )
  registerScenarioContract('copyright-case-purge-child-verify', { expectations: [] })
  await runAndCapture(
    'copyright-case-purge-child-verify',
    async () => {
      await using transaction = await beginTransaction()
      await verifyCopyrightCaseChildPage(transaction, dueId, direct, undefined, PAGE)
      await transaction.rollback()
    },
    undefined,
    'verifyCopyrightCaseChildPage',
  )
}
