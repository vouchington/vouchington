import { beginTransaction, read } from '@data-stores/psql'
import assert from 'node:assert/strict'
import {
  copyrightCasePurgeAdmissionStatement,
  copyrightResidualRecoveryStatement,
} from '@services/copyright-notices/retention-case-purge-admission'
import { verifyCopyrightCaseChildPage } from '@services/copyright-notices/retention-case-purge-children'
import { eraseCopyrightCaseEvidencePage } from '@services/copyright-notices/retention-case-purge-evidence'
import { copyrightCasePurgeEligibilitySql } from '@services/copyright-notices/retention-case-purge-eligibility'
import { COPYRIGHT_CASE_PURGE_PHASES } from '@data-stores/psql/copyright-case-purge-order'
import { copyrightCasePurgeProofSql } from '@services/copyright-notices/retention-case-purge-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedPurgeCases } from '../seed-data/copyright-case-purge.mts'
import {
  PURGE_EVIDENCE_ARTIFACT_SEEDED_ROWS,
  PURGE_EVIDENCE_SEEDED_ROWS,
} from '../seed-data/copyright-case-purge-volume.mts'
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
        indexes: ['idx_retained_copyright_notice_identities__residual'],
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
    forbidSequentialScans: [
      'copyright_notice_evidence_artifacts',
      'copyright_notice_email_intakes',
      'copyright_notice_email_intake_notice_links',
    ],
    expectations: [
      {
        kind: 'usesIndexes',
        // The case holds nearly every artifact, so the planner may walk the primary key and stop at
        // the case's first row; either index returns it with no sort, and the row cap proves it.
        indexes: [
          'copyright_notice_evidence_artifacts_copyright_notice_id_id_key',
          'copyright_notice_evidence_artifacts_pkey',
        ],
        anyOf: true,
        queryContains: 'readCopyrightCaseEvidenceArtifact',
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'copyright_notice_evidence_artifacts', max: 5 },
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_copyright_notice_email_intake_notice_links__notice',
          'copyright_notice_email_intake_notice_links_pkey',
        ],
        anyOf: true,
        queryContains: 'readCopyrightCaseEmailEvidence',
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'copyright_notice_email_intake_notice_links', max: 5 },
      { kind: 'maxProcessedRows', relation: 'copyright_notice_email_intakes', max: 5 },
    ],
    seededRows: {
      copyright_notice_evidence_artifacts: PURGE_EVIDENCE_ARTIFACT_SEEDED_ROWS,
      copyright_notice_email_intake_notice_links: PURGE_EVIDENCE_SEEDED_ROWS,
      copyright_notice_email_intakes: PURGE_EVIDENCE_SEEDED_ROWS + 7,
    },
  })
  await runAndCapture(
    'copyright-case-purge-evidence-reads',
    async () => {
      await using transaction = await beginTransaction()
      const evidencePage = (source: number) =>
        eraseCopyrightCaseEvidencePage(transaction, dueId, source, null, undefined, 10)
      const artifacts = await evidencePage(0)
      const emails = await evidencePage(1)
      await transaction.rollback()
      // Each source holds one live registry object, so the page claims it and stays on the source.
      assert.equal(artifacts.nextSourceIndex, 0)
      assert.equal(emails.nextSourceIndex, 1)
      assert.ok(artifacts.hasMore && emails.hasMore)
    },
    undefined,
    ['readCopyrightCaseEvidenceArtifact', 'readCopyrightCaseEmailEvidence'],
  )

  // The first two-edge path under the seeded email link: its ancestor lookup reads the real link.
  const nested = COPYRIGHT_CASE_PURGE_PHASES.findIndex(
    ([, path]) =>
      path.length === 2 && path[0]?.[0] === 'copyright_notice_email_intake_notice_links',
  )
  const direct = COPYRIGHT_CASE_PURGE_PHASES.findIndex(
    ([table, path]) => table === 'copyright_notice_email_intake_notice_links' && path.length === 1,
  )
  assert.ok(nested >= 0 && direct >= 0, 'The purge needs a nested and a direct child path')
  registerScenarioContract('copyright-case-purge-ancestor', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'copyright_notice_email_intake_notice_links', max: 5 },
    ],
  })
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
  registerScenarioContract('copyright-case-purge-child-verify', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'copyright_notice_email_intake_notice_links',
        max: 2 * PAGE,
      },
    ],
    seededRows: { copyright_notice_email_intake_notice_links: PURGE_EVIDENCE_SEEDED_ROWS },
  })
  await runAndCapture(
    'copyright-case-purge-child-verify',
    async () => {
      await using transaction = await beginTransaction()
      const page = await verifyCopyrightCaseChildPage(transaction, dueId, direct, undefined, PAGE)
      await transaction.rollback()
      assert.equal(page.processed, PAGE)
    },
    undefined,
    'verifyCopyrightCaseChildPage',
  )
}
