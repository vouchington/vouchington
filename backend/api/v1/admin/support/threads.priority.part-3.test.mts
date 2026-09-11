import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import { decodeCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

describe('support thread priority cursor continuation', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('continues from unresolved into and through the resolved rank', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `support-priority-resolved-cursor-${suffix}@voucha.ai`,
    })
    const openThread = await insertTestSupportThread({
      supportContactId: contact.id,
      subject: `support-priority-resolved-cursor-${suffix}`,
    })
    const resolvedThreads = await Promise.all(
      Array.from({ length: 3 }, () =>
        insertTestSupportThread({
          supportContactId: contact.id,
          subject: `support-priority-resolved-cursor-${suffix}`,
        }),
      ),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    for (const thread of resolvedThreads) {
      await request
        .patch(`/api/v1/support/threads/${thread.id}`)
        .send({ resolved: true })
        .expect(200)
    }
    const firstPage = await request
      .get(`/api/v1/support/threads?q=support-priority-resolved-cursor-${suffix}&limit=1`)
      .expect(200)

    expect(firstPage.body.results.map((thread: { status: string }) => thread.status)).toEqual([
      'open',
    ])
    expect(decodeCursor(firstPage.body.page_info.end_cursor)).toMatchObject({
      unresolved_sort: 0,
      service_level: 0,
    })

    const resolvedPage = await request
      .get(
        `/api/v1/support/threads?q=support-priority-resolved-cursor-${suffix}&limit=1&after=${encodeURIComponent(firstPage.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(resolvedPage.body.results.map((thread: { status: string }) => thread.status)).toEqual([
      'resolved',
    ])
    expect(decodeCursor(resolvedPage.body.page_info.end_cursor)).toMatchObject({
      unresolved_sort: 1,
      service_level: 0,
    })

    const continuation = await request
      .get(
        `/api/v1/support/threads?q=support-priority-resolved-cursor-${suffix}&limit=10&after=${encodeURIComponent(resolvedPage.body.page_info.end_cursor)}`,
      )
      .expect(200)

    const continuationIds = continuation.body.results.map((thread: { id: string }) => thread.id)
    expect(continuationIds).toHaveLength(2)
    expect(continuationIds).not.toContain(openThread.id)
    expect(continuation.body.results.map((thread: { status: string }) => thread.status)).toEqual([
      'resolved',
      'resolved',
    ])
    expect(
      new Set([
        ...firstPage.body.results.map((thread: { id: string }) => thread.id),
        ...resolvedPage.body.results.map((thread: { id: string }) => thread.id),
        ...continuationIds,
      ]),
    ).toEqual(new Set([openThread.id, ...resolvedThreads.map(thread => thread.id)]))
  })
})
