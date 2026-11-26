import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

export const copyrightExecutionBatchSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size
const workCount = 2_000
const oldTime = Date.UTC(2001, 0, 1)
const recentTime = Date.UTC(2001, 5, 1)
export const copyrightExecutionCutoff = new Date('2001-04-01T00:00:00Z')
export const copyrightOperationalSetting = 'app.copyright_operational_retention'
const notice = seedUuidAtTimestamp(oldTime, 919_000)
const image = seedUuidAtTimestamp(oldTime, 919_001)
const placement = seedUuidAtTimestamp(oldTime, 919_002)
const target = seedUuidAtTimestamp(oldTime, 919_003)
const filing = seedUuidAtTimestamp(oldTime, 919_004)
const restriction = seedUuidAtTimestamp(oldTime, 919_005)
const workIds = Array.from({ length: workCount }, (_, i) =>
  seedUuidAtTimestamp(oldTime, 920_000 + i),
)

export const copyrightExecutionLanes = [
  { kind: 'action_attempts', scenario: 'copyright-action-attempt-retention-at-cap' },
  { kind: 'delivery_attempts', scenario: 'copyright-delivery-attempt-retention-at-cap' },
] as const
export type CopyrightExecutionLane = (typeof copyrightExecutionLanes)[number]

export function executionRelations(kind: CopyrightExecutionLane['kind']) {
  return kind === 'action_attempts'
    ? {
        attempts: 'copyright_notice_action_attempts',
        results: 'copyright_notice_action_attempt_results',
      }
    : {
        attempts: 'copyright_notice_delivery_attempts',
        results: 'copyright_notice_delivery_attempt_results',
      }
}

export function copyrightExecutionRows() {
  const page = workIds.slice(0, copyrightExecutionBatchSize).map((workId, i) => ({
    id: seedUuidAtTimestamp(oldTime, 930_000 + i),
    workId,
    number: 1,
    finishedAt: i % 4 === 3 ? null : new Date(i % 4 === 1 ? recentTime : oldTime + 60_000),
  }))
  const background = workIds.slice(page.length).map((workId, i) => ({
    id: seedUuidAtTimestamp(recentTime, 940_000 + i),
    workId,
    number: 1,
    finishedAt: new Date(recentTime + 60_000),
  }))
  const newer = page.flatMap((row, i) =>
    i % 4 === 2
      ? []
      : [
          {
            id: seedUuidAtTimestamp(recentTime, 950_000 + i),
            workId: row.workId,
            number: 2,
            finishedAt: new Date(recentTime + 60_000),
          },
        ],
  )
  return {
    rows: [...page, ...background, ...newer],
    pageIds: page.map(row => row.id),
    eligible: page.filter((_, index) => index % 4 === 0),
  }
}

type ExecutionRows = ReturnType<typeof copyrightExecutionRows>['rows']

/** Reuse immutable legal and work-item anchors on repeat runs of this disposable harness. */
export async function seedCopyrightExecutionWork(): Promise<void> {
  const received = new Date(oldTime - 86_400_000)
  await using query = await beginTransaction()
  await query(
    `/* seedCopyrightExecutionNotice */
     INSERT INTO copyright_notices (id, jurisdiction, legal_basis, received_at, last_legal_activity_at,
       claimant_contact_ciphertext, work_description, policy_version)
     SELECT $1::uuid, 'us_dmca', 'copyright', $2::timestamptz, $2::timestamptz,
       'synthetic-ciphertext', 'EXPLAIN execution retention', 'explain-execution-retention'
     WHERE NOT EXISTS (SELECT 1 FROM copyright_notices WHERE id = $1::uuid)`,
    [notice, received],
  )
  await query(
    `/* seedCopyrightExecutionFilingAndImage */
     WITH filing AS (
       INSERT INTO copyright_notice_submissions
         (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
       VALUES ($1, $2, 'court_or_ccb_hold', $3, 'staff', 'synthetic-ciphertext')
       ON CONFLICT (id) DO NOTHING
     ), image AS (
       INSERT INTO retained_image_identities (id, created_by_id) VALUES ($4, $5)
       ON CONFLICT (id) DO NOTHING
     )
     INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
     VALUES ($6, $4, 'post') ON CONFLICT (placement_id) DO NOTHING`,
    [filing, notice, received, image, seedUuid(0, '01'), placement],
  )
  await query(
    `/* seedCopyrightExecutionTarget */
     INSERT INTO copyright_notice_targets
       (id, copyright_notice_id, placement_id, placement_revision, hosted_use_url)
     VALUES ($1, $2, $3, 1, 'https://example.invalid/explain-execution')
     ON CONFLICT (id) DO NOTHING`,
    [target, notice, placement],
  )
  await query(
    `/* seedCopyrightExecutionRestriction */
     INSERT INTO copyright_restrictions
       (id, copyright_notice_target_id, copyright_notice_submission_id, imposed_at)
     VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
    [restriction, target, filing, received],
  )
  await query(
    `/* seedCopyrightExecutionWork */
     WITH action_work AS (
       INSERT INTO copyright_notice_action_work_items
         (id, copyright_notice_id, copyright_restriction_id, expected_placement_revision, action)
       SELECT id, $2, $3, ordinal::int, 'withhold'
       FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)
       ON CONFLICT (id) DO NOTHING
     )
     INSERT INTO copyright_notice_delivery_work_items
       (id, copyright_notice_id, recipient_role, delivery_kind, channel, idempotency_key)
     SELECT id, $2, 'claimant', 'claimant_receipt', 'in_app', 'explain-execution-' || id
     FROM unnest($1::uuid[]) AS input(id) ON CONFLICT (id) DO NOTHING`,
    [workIds, notice, restriction],
  )
  await query.commit()
}

export async function seedCopyrightExecutionRows(
  query: TransactionQuery,
  kind: CopyrightExecutionLane['kind'],
  rows: ExecutionRows,
): Promise<void> {
  const { attempts } = executionRelations(kind)
  await query(
    `/* seedCopyrightExecutionAttempts */
     INSERT INTO ${attempts} (id, work_item_id, generation, attempt_number, lease_token, started_at)
     SELECT id, work_item, 1, number, id, uuid_extract_timestamp(id)
     FROM unnest($1::uuid[], $2::uuid[], $3::int[]) AS input(id, work_item, number)`,
    [rows.map(row => row.id), rows.map(row => row.workId), rows.map(row => row.number)],
  )
  await restoreCopyrightExecutionResults(query, kind, rows)
}

export async function restoreCopyrightExecutionResults(
  query: TransactionQuery,
  kind: CopyrightExecutionLane['kind'],
  rows: ExecutionRows,
): Promise<void> {
  const { results } = executionRelations(kind)
  await query(
    `/* restoreCopyrightExecutionResults */
     INSERT INTO ${results} (attempt_id, failed_at)
     SELECT id, finished_at
     FROM unnest($1::uuid[], $2::timestamptz[]) AS input(id, finished_at)
     WHERE finished_at IS NOT NULL ON CONFLICT (attempt_id) DO NOTHING`,
    [rows.map(row => row.id), rows.map(row => row.finishedAt)],
  )
}
