import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { listNotifications } from '@services/notifications/list'
import { markAllNotificationsRead } from '@services/notifications/mutations'
import {
  notificationsWorkConfig,
  notificationsWorkMaxValues,
} from '@services/notifications/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runNotificationInboxCapacityScenario(): Promise<void> {
  const scenario = 'notifications-inbox-at-cap'
  const limit = 100
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'singleLeaf', parent: 'notifications', key: 'user_id' },
      { kind: 'maxProcessedRows', relation: 'notifications', max: limit + 1 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const page = await listNotifications(seedUser.id, { limit })
      if (
        page.results.length !== limit ||
        !page.page_info.has_next_page ||
        page.results.some((row, index) => index > 0 && row.id >= page.results[index - 1]!.id)
      ) {
        throw new Error('The inbox must return a full newest-first page and a continuation')
      }
    },
    undefined,
    'listNotifications',
  )
}

export async function runMarkNotificationInboxCapacityScenario(): Promise<void> {
  const scenario = 'notifications-mark-all-read-at-cap'
  const pageSize = notificationsWorkMaxValues.mark_all_read_page_size
  await notificationsWorkConfig.waitForInitialization()
  const { rows: users } = await write<{ id: string }>(sql`
    /* seedMarkAllReadUser */
    INSERT INTO users (username) VALUES (${`explain-read-${randomUUID()}`}) RETURNING id
  `)
  const userId = users[0]!.id

  try {
    const postIds = Array.from({ length: 2 * pageSize }, (_, index) => seedUuid(index, '05'))
    const { rows } = await write<{ id: string; read_at: Date | null }>(sql`
      /* seedMarkAllReadInbox */
      INSERT INTO notifications (user_id, entity_type, kind, post_id, target_path, read_at)
      SELECT ${userId}, 'post', 'post_new', post_id, '/posts/explain-mark-all-read',
        CASE WHEN ordinal > ${pageSize} THEN CURRENT_TIMESTAMP END
      FROM unnest(${postIds}::uuid[]) WITH ORDINALITY AS input(post_id, ordinal)
      RETURNING id, read_at
    `)
    const unreadIds = rows.filter(row => row.read_at === null).map(row => row.id)
    registerScenarioContract(scenario, {
      expectations: [
        // At most the boundary, the candidate page, and one lookup and update per selected row.
        { kind: 'maxProcessedRows', relation: 'notifications', max: 3 * pageSize + 1 },
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
          const page = await markAllNotificationsRead(userId)
          if (page.marked_read !== pageSize || page.has_more) {
            throw new Error('Mark-all-read must process the full page of unread notifications')
          }
        } finally {
          restore()
        }
      },
      undefined,
      'markAllNotificationsRead',
      {
        exactCapturedNames: ['markAllNotificationsRead'],
        afterCapture: async () => {
          // The service call commits; restore the starting state before the rolled-back replays.
          await write(sql`/* restoreMarkAllReadInbox */
            UPDATE notifications SET read_at = NULL
            WHERE user_id = ${userId} AND id = ANY(${unreadIds}::uuid[])`)
        },
      },
    )
  } finally {
    await write(sql`/* deleteMarkAllReadUser */ DELETE FROM users WHERE id = ${userId}`)
  }
}
