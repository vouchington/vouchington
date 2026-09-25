import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { parseCopyrightSweepPageOptions, toCopyrightSweepIdPage } from './sweep-id-pages.mts'

const CURSOR_MESSAGE = 'Invalid copyright sweep cursor'
const FIRST_ID = '00000000-0000-7000-8000-000000000001'
const SECOND_ID = '00000000-0000-7000-8000-000000000002'

function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe('copyright sweep ID pages', () => {
  it('defaults to a full first page', () => {
    expect(parseCopyrightSweepPageOptions({}, CURSOR_MESSAGE)).toEqual({
      limit: 100,
      afterId: null,
    })
  })

  it('decodes the ID after which the page starts', () => {
    expect(
      parseCopyrightSweepPageOptions(
        { after: encodeCursor({ id: FIRST_ID }), limit: 1 },
        CURSOR_MESSAGE,
      ),
    ).toEqual({ limit: 1, afterId: FIRST_ID })
  })

  it.each([0, 101, 1.5])('rejects a page limit of %s', limit => {
    expect(thrownBy(() => parseCopyrightSweepPageOptions({ limit }, CURSOR_MESSAGE))).toMatchObject(
      { status: 422, message: 'limit must be between 1 and 100' },
    )
  })

  it('rejects a malformed cursor with the sweep message', () => {
    expect(
      thrownBy(() => parseCopyrightSweepPageOptions({ after: 'not-a-cursor' }, CURSOR_MESSAGE)),
    ).toMatchObject({ status: 400, message: CURSOR_MESSAGE })
  })

  it('keeps the page within its limit and continues from its last ID', () => {
    expect(toCopyrightSweepIdPage([{ id: FIRST_ID }, { id: SECOND_ID }], 1)).toEqual({
      results: [FIRST_ID],
      page_info: {
        has_next_page: true,
        start_cursor: encodeCursor({ id: FIRST_ID }),
        end_cursor: encodeCursor({ id: FIRST_ID }),
      },
    })
  })

  it('ends the walk on the last page', () => {
    expect(toCopyrightSweepIdPage([{ id: FIRST_ID }], 1).page_info).toMatchObject({
      has_next_page: false,
      end_cursor: null,
    })
  })
})
