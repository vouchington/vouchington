import { write } from '@data-stores/psql'
import type { PrivateUser } from '../services/users/types.mts'
import sql from 'sql-template-strings'
import { copyrightStaffQueueKeysSql } from '../services/copyright-notices/read-models-staff-queue-sql.mts'
import { createRequest } from './api/server.mts'
import { readCopyrightStaffQueueWindow, type QueuePage } from './copyright-staff-queue-walk.mts'

/** Authenticated staff-queue HTTP against committed rows on the shared database. */
export async function withCopyrightStaffQueueHttp<Result>(
  moderator: PrivateUser,
  run: (context: {
    read: (
      ids: readonly string[],
      boost: boolean,
      limit: 1 | 100,
    ) => Promise<QueuePage & { observedIds: string[]; rawObservedIds: string[] }>
    rejectPriorCursor: (cursor: string) => Promise<void>
    assertInterleaving: (
      first: string,
      control: string,
      last: string,
      boost: boolean,
    ) => Promise<void>
  }) => Promise<Result>,
): Promise<Result> {
  const request = createRequest()
  await request.authenticateAs(moderator)
  const requiredControls = new Set<string>()
  return run({
    read: (ids, boost, limit) =>
      readCopyrightStaffQueueWindow({
        request,
        ids,
        controls: [...requiredControls],
        boost,
        limit,
      }),
    assertInterleaving: async (first, control, last, boost) => {
      const { rows } = await write<{ id: string }>(
        sql`/* assertCopyrightQueueInterleaving */`.append(
          copyrightStaffQueueKeysSql({ trustedFlaggerBoost: boost }),
        ).append(sql` SELECT id FROM queue_key WHERE id = ANY(${[first, control, last]}::uuid[])
              ORDER BY tier, waiting_since, id LIMIT 3`),
      )
      if (rows.map(row => row.id).join(',') !== [first, control, last].join(',')) {
        throw new Error('Eligible control does not interleave in the real native queue')
      }
      requiredControls.add(control)
    },
    rejectPriorCursor: async cursor => {
      await request
        .get(`/api/v1/copyright-notices/review-queue?after=${encodeURIComponent(cursor)}`)
        .expect(400)
    },
  })
}
