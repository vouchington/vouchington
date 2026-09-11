import { describe, expect, it } from 'vitest'
import { insertTestSupportContact } from '@voucha/test-helpers/entities/support-contacts'
import { insertTestSupportThread } from '@voucha/test-helpers/entities/support-threads'
import { encodeCursor } from '@modules/pagination'

import { createSupportMessage } from '../create-support-message.mts'
import { getSupportMessagesByThreadId } from '../get-support-messages-by-thread-id.mts'

function rand() {
  return Math.random().toString(36).slice(2, 10)
}

function createTestMessages(threadId: string, prefix: string, count: number) {
  return Promise.all(
    Array.from({ length: count }, (_, index) =>
      createSupportMessage(
        threadId,
        { direction: 'inbound', bodyText: `${prefix} ${index}` },
        { skipEnqueue: true },
      ),
    ),
  )
}

describe('getSupportMessagesByThreadId', () => {
  it('traverses every message chronologically through older pages', async () => {
    const localContact = await insertTestSupportContact({
      emailAddress: `tests+messages-order-${rand()}@voucha.ai`,
    })
    const localThread = await insertTestSupportThread({ supportContactId: localContact.id })
    const created = await createTestMessages(localThread.id, 'Thread message', 7)
    const expectedIds = created.map(message => message.id).toSorted()
    const traversed = [] as string[]
    const pageIds = [] as string[][]
    let after: string | undefined
    let terminalPageInfo: { has_next_page: boolean; end_cursor: string | null } | undefined

    for (;;) {
      const { results, page_info } = await getSupportMessagesByThreadId(localThread.id, {
        limit: 2,
        after,
      })
      const ids = results.map(message => message.id)
      pageIds.push(ids)
      traversed.unshift(...ids)
      if (!page_info.has_next_page) {
        terminalPageInfo = page_info
        break
      }
      after = page_info.end_cursor!
    }

    expect(pageIds).toEqual(pageIds.map(ids => ids.toSorted()))
    expect(terminalPageInfo).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(traversed).toEqual(expectedIds)
    expect(new Set(traversed).size).toBe(expectedIds.length)
  })

  it('returns the inclusive message window ending at a delayed same-thread anchor', async () => {
    const localContact = await insertTestSupportContact({
      emailAddress: `tests+messages-anchor-${rand()}@voucha.ai`,
    })
    const localThread = await insertTestSupportThread({ supportContactId: localContact.id })
    const throughAnchor = await createTestMessages(localThread.id, 'Before anchor', 22)
    const sortedThroughAnchor = throughAnchor.toSorted((left, right) =>
      left.id.localeCompare(right.id),
    )
    const anchor = sortedThroughAnchor.at(-1)!
    const laterMessages = await createTestMessages(localThread.id, 'After anchor', 21)
    const { results } = await getSupportMessagesByThreadId(localThread.id, {
      limit: 20,
      atOrBeforeMessageId: anchor.id,
    })

    expect(results).toHaveLength(20)
    expect(results.at(-1)?.id).toBe(anchor.id)
    const resultIds = results.map(message => message.id)
    expect(resultIds).toEqual(sortedThroughAnchor.slice(-20).map(message => message.id))
    expect(resultIds).not.toEqual(expect.arrayContaining(laterMessages.map(message => message.id)))
  })

  it('returns an empty page when a boundary is foreign to the thread or absent', async () => {
    const localContact = await insertTestSupportContact({
      emailAddress: `tests+messages-boundary-${rand()}@voucha.ai`,
    })
    const localThread = await insertTestSupportThread({ supportContactId: localContact.id })
    await createSupportMessage(localThread.id, { direction: 'inbound', bodyText: 'Local message' })
    const otherContact = await insertTestSupportContact({
      emailAddress: `tests+messages-foreign-boundary-${rand()}@voucha.ai`,
    })
    const otherThread = await insertTestSupportThread({ supportContactId: otherContact.id })
    const foreignMessage = await createSupportMessage(otherThread.id, {
      direction: 'inbound',
      bodyText: 'Foreign message',
    })
    const emptyPage = {
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    }

    await expect(
      getSupportMessagesByThreadId(localThread.id, {
        after: encodeCursor({ id: foreignMessage.id }),
      }),
    ).resolves.toEqual(emptyPage)
    await expect(
      getSupportMessagesByThreadId(localThread.id, {
        atOrBeforeMessageId: foreignMessage.id,
      }),
    ).resolves.toEqual(emptyPage)

    const absentMessageId = '019e0000-ffff-7000-8000-ffffffffffff'
    await expect(
      getSupportMessagesByThreadId(localThread.id, {
        after: encodeCursor({ id: absentMessageId }),
      }),
    ).resolves.toEqual(emptyPage)
    await expect(
      getSupportMessagesByThreadId(localThread.id, { atOrBeforeMessageId: absentMessageId }),
    ).resolves.toEqual(emptyPage)
  })
})
