import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import {
  pagedDispatchConfig,
  pagedDispatchMaxValues,
} from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import {
  isCriticalAlertReportLive,
  listCriticalAlertRecipientPage,
  writeCriticalAlertCandidatePage,
} from '@services/notifications/create-critical-moderation-alert-notification'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  cleanupCriticalAlertRecipientPages,
  criticalAlertStaffIds,
  CRITICAL_ALERT_STAFF_COUNT,
  seedCriticalAlertRecipientPages,
} from '../seed-data/critical-alert-recipient-pages.mts'

const CAP = pagedDispatchMaxValues.notifications_page_size as number
const PAGE_ROLE_ROWS = 2 * (CAP + 1)

/** Last scenario: its large temporary staff cohort cannot alter earlier plan statistics. */
export async function runCriticalAlertRecipientPageScenarios(): Promise<void> {
  await pagedDispatchConfig.waitForInitialization()
  const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
    notifications_page_size: CAP,
  })
  try {
    await cleanupCriticalAlertRecipientPages()
    const { freshReportId, duplicateReportId } = await seedCriticalAlertRecipientPages()
    await captureReportChecks(freshReportId)
    await captureRecipientPages()
    const ids = criticalAlertStaffIds().slice(0, CAP)
    await captureInsert('critical-alert-insert-fresh', freshReportId, ids, CAP)
    const existing = await writeCriticalAlertCandidatePage(duplicateReportId, ids)
    assert.equal(existing.length, CAP)
    await captureInsert('critical-alert-insert-deduplicated', duplicateReportId, ids, 0)
  } finally {
    try {
      await cleanupCriticalAlertRecipientPages()
    } finally {
      restore()
    }
  }
}

async function captureReportChecks(reportId: string): Promise<void> {
  const cases = [
    ['critical-alert-report-live', reportId, true],
    ['critical-alert-report-missing', 'ffffffff-ffff-ffff-ffff-ffffffffffff', false],
  ] as const
  for (const [id, candidateId, expected] of cases) {
    registerScenarioContract(id, {
      seededRows: { moderation_reports: 2 },
      expectations: [
        { kind: 'usesIndexes', indexes: ['moderation_reports_pkey'] },
        { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 1 },
      ],
      forbidSequentialScans: ['moderation_reports'],
      ...(!expected ? { allowEmptyResult: true } : {}),
    })
    // no-mistakes-disable-next-line query-reached-per-item: live and missing PK probes own separate plan contracts.
    await runAndCapture(
      id,
      async () => assert.equal(await isCriticalAlertReportLive(candidateId), expected),
      undefined,
      'isCriticalAlertReportLive',
    )
  }
}

async function captureRecipientPages(): Promise<void> {
  const pages = [
    ['critical-alert-recipients-first-page', null, CAP, true],
    ['critical-alert-recipients-continuation', seedUuid(14_998, '01'), CAP, true],
    ['critical-alert-recipients-empty', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 0, false],
  ] as const
  for (const [id, afterUserId, expected, hasMore] of pages) {
    registerScenarioContract(id, {
      seededRows: { user_roles: CRITICAL_ALERT_STAFF_COUNT * 2 },
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: [expected === 0 ? 'user_roles_pkey' : 'idx_user_roles__role_type_id'],
        },
        { kind: 'maxProcessedRows', relation: 'user_roles', max: PAGE_ROLE_ROWS },
        { kind: 'queryBinds', token: 'LIMIT' },
      ],
      forbidSequentialScans: ['user_roles'],
      ...(expected === 0 ? { allowEmptyResult: true } : {}),
    })
    // no-mistakes-disable-next-line query-reached-per-item: three distinct cursor positions have separate bounded plan contracts.
    await runAndCapture(
      id,
      async () => {
        const page = await listCriticalAlertRecipientPage(afterUserId, CAP)
        assert.equal(page.recipientIds.length, expected)
        assert.equal(page.nextAfterUserId !== null, hasMore)
      },
      undefined,
      'listCriticalAlertRecipientPage',
    )
  }
}

async function captureInsert(
  id: 'critical-alert-insert-fresh' | 'critical-alert-insert-deduplicated',
  reportId: string,
  recipientIds: readonly string[],
  expected: number,
): Promise<void> {
  registerScenarioContract(id, {
    seededRows: {
      user_roles: CRITICAL_ALERT_STAFF_COUNT * 2,
      users: 20_000,
      notifications: expected === 0 ? CAP : 0,
    },
    expectations: [
      { kind: 'usesIndexes', indexes: ['user_roles_pkey', 'users_pkey'], anyOf: true },
      { kind: 'maxProcessedRows', relation: 'user_roles', max: 2 * CAP },
      { kind: 'maxProcessedRows', relation: 'users', max: CAP },
      { kind: 'maxProcessedRows', relation: 'notifications', max: CAP },
    ],
    forbidSequentialScans: ['user_roles', 'users', 'notifications'],
    ...(expected === 0 ? { allowEmptyResult: true } : {}),
  })
  await runAndCapture(
    id,
    async () => {
      await using query = await beginTransaction()
      const rows = await writeCriticalAlertCandidatePage(reportId, recipientIds, query)
      assert.equal(rows.length, expected)
      await query.rollback()
    },
    undefined,
    'insertCriticalAlertNotifications',
  )
}
