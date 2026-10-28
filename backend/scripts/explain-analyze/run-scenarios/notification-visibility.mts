import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import {
  reconcilePostContentNotificationVisibility,
  reconcileRssFeedItemContentNotificationVisibility,
  type ContentVisibilityCursor,
} from '@services/notifications/content-visibility-writes'
import { reconcilePostMembershipVisibility } from '@services/notifications/reconcile-post'
import { reconcileRssFeedItemMembershipVisibility } from '@services/notifications/reconcile-rss-feed-item'
import { getContentVisibilityPageLimit } from '@services/notifications/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  NOTIFICATION_VISIBILITY_SEED as s,
  seedNotificationVisibility,
  resetNotificationVisibilityContent,
} from '../seed-data/notification-visibility.mts'
import { cleanupNotificationVisibility } from '../seed-data/notification-visibility-cleanup.mts'
import { runAnalyze } from '../seed-data/maintenance.mts'
import { refreshExplainMaterializedViews } from '../seed-data/materialized-view-maintenance.mts'

export async function runNotificationVisibilityScenarios(): Promise<void> {
  try {
    await cleanupNotificationVisibility()
    await seedNotificationVisibility()
    await runAnalyze()
    await captureNotificationVisibility()
  } finally {
    await cleanupNotificationVisibility()
    await runAnalyze()
    await refreshExplainMaterializedViews(refreshMaterializedView, statement => write(statement))
  }
}

async function captureNotificationVisibility(): Promise<void> {
  const cap = getContentVisibilityPageLimit()
  const cases = [
    [
      'notification-post-content-page',
      'reconcilePostContentNotificationVisibility',
      (after?: ContentVisibilityCursor) =>
        reconcilePostContentNotificationVisibility(s.posts[1]!, after),
      3,
    ],
    [
      'notification-rss-content-page',
      'reconcileRssFeedItemContentNotificationVisibility',
      (after?: ContentVisibilityCursor) =>
        reconcileRssFeedItemContentNotificationVisibility(s.items[1]!, after),
      3,
    ],
    [
      'notification-post-membership-target-page',
      'selectMembershipVisibilityTargetPage',
      (after?: ContentVisibilityCursor) => reconcilePostMembershipVisibility(s.posts[0]!, after),
      1,
    ],
    [
      'notification-rss-membership-target-page',
      'selectMembershipVisibilityTargetPage',
      (after?: ContentVisibilityCursor) =>
        reconcileRssFeedItemMembershipVisibility(s.items[0]!, after),
      1,
    ],
  ] as const
  for (const [id, queryName, run, scans] of cases) {
    registerScenarioContract(id, {
      seededRows: { notifications: s.count * 5 },
      // A publication target spans recipient partitions; the indexed raw page is capped first.
      crossPartition: {
        notifications:
          'Publication target lookup spans recipient partitions before a bounded (user_id,id) window is locked.',
      },
      expectations: [
        // DML accounting includes the raw scan, bounded PK lookup and UPDATE RETURNING rows.
        { kind: 'maxProcessedRows', relation: 'notifications', max: cap * scans },
        { kind: 'queryBinds', token: 'LIMIT' },
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: four fixed owning query contracts need independent custom/generic captures with the same live fixture.
    await runAndCapture(
      id,
      async () => {
        const page = await run()
        assert.equal(page.pruned, scans > 1 ? cap : 0)
        assert.ok(page.nextCursor, 'A hot target must return its bounded raw cursor')
        assert.equal(page.nextCursor.userId, s.user)
        const resumed = await run(page.nextCursor)
        assert.equal(resumed.pruned, scans > 1 ? cap : 0)
        assert.ok(resumed.nextCursor, 'The resumed hot page must retain its raw cursor')
        assert.equal(resumed.nextCursor.userId, s.user)
        assert.ok(resumed.nextCursor.notificationId > page.nextCursor.notificationId)
      },
      undefined,
      queryName,
      // EXPLAIN rolls each mode/pass back; reset the captured write so every plan prunes a page.
      { ...(scans > 1 ? { afterCapture: resetNotificationVisibilityContent } : {}) },
    )
  }
}
