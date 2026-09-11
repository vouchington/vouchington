import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import {
  buildListPendingMemberSupportAgentIntentsQuery,
  createPendingMemberSupportAgentIntentPage,
} from './automatic-support-agent-intent.mts'

describe('createPendingMemberSupportAgentIntentPage', () => {
  it('advances from the final returned intent rather than the lookahead row', () => {
    const rows = [
      {
        support_thread_id: 'thread-one',
        support_message_id: '01900000-0000-7000-8000-000000000001',
        idempotency_key: 'job-one',
      },
      {
        support_thread_id: 'thread-two',
        support_message_id: '01900000-0000-7000-8000-000000000002',
        idempotency_key: 'job-two',
      },
    ]

    const page = createPendingMemberSupportAgentIntentPage(rows, 1)

    expect(page.results).toHaveLength(1)
    expect(page.page_info).toMatchObject({
      has_next_page: true,
      end_cursor: encodeCursor({ id: rows[0]!.support_message_id }),
    })
  })

  it('builds a cursor-indexable scan for unfinished member-created intents', () => {
    const cursor = '01900000-0000-7000-8000-000000000001'
    const query = buildListPendingMemberSupportAgentIntentsQuery(cursor, 100)

    expect(query.text).toMatchInlineSnapshot(`
      "/* listPendingMemberSupportAgentIntents */
          SELECT support_thread_id, support_message_id, idempotency_key
          FROM support_agent_runs
          WHERE idempotency_key =
              'support_member_thread__' || support_message_id::TEXT || '__customer_support'
            AND completed_at IS NULL
          AND support_message_id > $1
          ORDER BY support_message_id LIMIT $2"
    `)
    expect(query.values).toEqual([cursor, 101])
  })
})
