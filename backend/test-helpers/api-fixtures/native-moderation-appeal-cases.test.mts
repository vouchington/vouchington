import { describe, expect, it } from 'vitest'
import { decodeCursor } from '@modules/pagination'
import { responseBody } from './static-response-bodies.mts'
import { nativeModerationAppealApiFixtureCases } from './native-moderation-appeal-cases.mts'

describe('native moderation appeal and dispute cursor fixtures', () => {
  it('connects the two appeal pages with exact staff-list cursors', () => {
    const first = responseBody('native.moderation.appeals.default') as AppealBody
    const second = responseBody('native.moderation.appeals.page-2') as AppealBody
    const firstCursor = decodeCursor(first.page_info.end_cursor!) as { id: string; scope: string }
    const secondCursor = decodeCursor(second.page_info.start_cursor) as {
      id: string
      scope: string
    }

    expect(firstCursor).toEqual({
      id: first.appeals.at(-1)!.id,
      scope: 'appeals:pending:staff-all:id-desc',
    })
    expect(nativeModerationAppealApiFixtureCases[1]!.query!.after).toBe(first.page_info.end_cursor)
    expect(secondCursor).toEqual({
      id: second.appeals[0]!.id,
      scope: 'appeals:pending:staff-all:id-desc',
    })
  })

  it('gives a nonempty terminal dispute page a scoped start cursor', () => {
    const body = responseBody('native.moderation.disputes.default') as DisputeBody
    expect(decodeCursor(body.page_info.start_cursor)).toEqual({
      id: body.disputes[0]!.id,
      scope: 'disputes:pending:staff:all:id-desc',
    })
  })
})

type AppealBody = {
  appeals: Array<{ id: string }>
  page_info: { start_cursor: string; end_cursor: string | null }
}

type DisputeBody = {
  disputes: Array<{ id: string }>
  page_info: { start_cursor: string }
}
