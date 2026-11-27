import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { background } from '@queues/background/queues'
import { listNotifications } from '@services/notifications/list'
import { markAllNotificationsRead } from '@services/notifications/mutations'
import {
  notificationsWorkConfig,
  notificationsWorkMaxValues,
} from '@services/notifications/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { withNotificationInbox } from '../seed-data/notification-inbox.mts'

export async function runNotificationInboxCapacityScenario(): Promise<void> {
  const scenario = 'notifications-inbox-at-cap'
  const limit = 100
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'singleLeaf', parent: 'notifications', key: 'user_id' },
      { kind: 'maxProcessedRows', relation: 'notifications', max: limit + 1 },
    ],
  })
  await withNotificationInbox(
    { unread: 2_000, backgroundRecipients: 0 },
    async ({ recipientId, notifications }) => {
      await runAndCapture(
        scenario,
        async () => {
          const page = await listNotifications(recipientId, { limit })
          assert.deepEqual(
            page.results.map(row => row.id),
            notifications.slice(0, limit).map(row => row.id),
          )
          assert.equal(page.page_info.has_next_page, true)
        },
        undefined,
        'listNotifications',
      )
    },
  )
}

export async function runMarkNotificationInboxCapacityScenario(): Promise<void> {
  const scenario = 'notifications-mark-all-read-at-cap'
  const pageSize = notificationsWorkMaxValues.mark_all_read_page_size
  await notificationsWorkConfig.waitForInitialization()
  // Give the target a newer already-read tail and keep other recipients in the same partition.
  await withNotificationInbox(
    { unread: pageSize + 1, read: pageSize, backgroundRecipients: 40 },
    async ({ recipientId: userId, notifications: rows, latePostId }) => {
      let continuationJobId: string | undefined
      try {
        // Autovacuum may or may not have described the fresh inbox by capture time. Fix the
        // statistics so a regression to a join the planner can hash against a partition scan
        // fails every run instead of only the runs that happen to be analyzed.
        await write('/* analyzeMarkAllReadInbox */ ANALYZE notifications')
        const unreadIds = rows
          .filter(row => row.read_at === null)
          .map(row => row.id)
          .toSorted()
        assert.equal(unreadIds.length, pageSize + 1)
        const firstPageIds = new Set(unreadIds.slice(0, pageSize))
        const lastPageId = unreadIds[pageSize - 1]!
        const throughId = unreadIds[pageSize]!
        let lateId: string | undefined
        const alreadyRead = rows.filter(row => row.read_at !== null)
        assert.equal(alreadyRead.length, pageSize)
        assert(alreadyRead.every(row => row.id > throughId))
        const originalReadAt = alreadyRead[0]?.read_at
        assert(originalReadAt)
        registerScenarioContract(scenario, {
          expectations: [
            // One boundary row, a candidate page plus lookahead, and one lookup and update per marked row.
            { kind: 'maxProcessedRows', relation: 'notifications', max: 3 * pageSize + 2 },
          ],
          forbidSequentialScans: ['notifications'],
        })
        await runAndCapture(
          scenario,
          async () => {
            const restore = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
              mark_all_read_page_size: pageSize,
            })
            try {
              const first = await markAllNotificationsRead(userId)
              assert.deepEqual(first, {
                marked_read: pageSize,
                has_more: true,
                through_id: throughId,
                last_page_id: lastPageId,
              })
              continuationJobId = `notifications-mark-all-read__${userId}__${throughId}__${lastPageId}`
              const job = await background.getJob(continuationJobId)
              assert.deepEqual(job?.data, { userId, throughId, lastPageId })

              const firstState = await readNotificationReadState(userId)
              assert.deepEqual(
                firstState.filter(row => row.read_at === null).map(row => row.id),
                [throughId],
              )
              assert.deepEqual(
                firstState.filter(row => firstPageIds.has(row.id)).map(row => row.id),
                [...firstPageIds],
              )

              lateId = await insertLateNotification(userId, latePostId)
              assert(lateId > throughId)
              const last = await markAllNotificationsRead(userId, throughId)
              assert.deepEqual(last, {
                marked_read: 1,
                has_more: false,
                through_id: throughId,
                last_page_id: throughId,
              })
              const lastState = await readNotificationReadState(userId)
              assert.deepEqual(
                lastState.filter(row => row.read_at === null).map(row => row.id),
                [lateId],
              )
              const alreadyReadIds = new Set(alreadyRead.map(row => row.id))
              assert.deepEqual(
                lastState.filter(row => alreadyReadIds.has(row.id)),
                alreadyRead.toSorted((a, b) => a.id.localeCompare(b.id)),
              )
            } finally {
              restore()
            }
          },
          undefined,
          'markAllNotificationsRead',
          {
            exactCapturedNames: [
              'markAllNotificationsRead',
              'readMarkAllReadState',
              'seedMarkAllReadLateNotification',
              'markAllNotificationsRead',
              'readMarkAllReadState',
            ],
            beforeExplain: async ({ values }) => {
              const isContinuation = values[1] !== null
              assert(lateId)
              // Rebuild each statement's starting state, including the continuation's new arrival.
              await write(sql`/* restoreMarkAllReadInbox */
                UPDATE notifications
                SET read_at = CASE
                  WHEN (${isContinuation} AND id = ANY(${[...firstPageIds]}::uuid[]))
                    OR (NOT ${isContinuation} AND id = ${lateId}::uuid)
                  THEN ${originalReadAt}::timestamptz ELSE NULL
                END
                WHERE user_id = ${userId} AND id = ANY(${[...unreadIds, lateId]}::uuid[])`)
            },
          },
        )
      } finally {
        if (continuationJobId) await (await background.getJob(continuationJobId))?.remove()
      }
    },
  )
}

async function readNotificationReadState(userId: string) {
  const { rows } = await write<{ id: string; read_at: Date | null }>(sql`/* readMarkAllReadState */
    SELECT id, read_at FROM notifications WHERE user_id = ${userId} ORDER BY id
  `)
  return rows
}

async function insertLateNotification(userId: string, postId: string) {
  const { rows } = await write<{ id: string }>(sql`/* seedMarkAllReadLateNotification */
    INSERT INTO notifications (user_id, entity_type, kind, post_id, target_path)
    VALUES (${userId}, 'post', 'post_new', ${postId}, '/posts/explain-mark-all-read')
    RETURNING id
  `)
  return rows[0]!.id
}
