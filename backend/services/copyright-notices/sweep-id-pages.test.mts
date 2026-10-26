import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createTestSqlStatement } from '@voucha/test-helpers/sql-query-inputs'
import { parseCopyrightSweepPageOptions, queryCopyrightSweepIdPage } from './sweep-id-pages.mts'

const CURSOR_MESSAGE = 'Invalid copyright sweep cursor'
const FIRST_ID = '00000000-0000-7000-8000-000000000001'

function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (err) {
    return err
  }
  return undefined
}

describe('copyright sweep ID pages', () => {
  it('rejects an unknown runtime ID column before querying', async () => {
    await expect(
      queryCopyrightSweepIdPage(
        { after: encodeCursor({ id: FIRST_ID }) },
        CURSOR_MESSAGE,
        'searchPendingCopyrightEnforcementAssessmentIds',
        'unknown' as Parameters<typeof queryCopyrightSweepIdPage>[3],
        createTestSqlStatement(),
        async () => ({ rows: [] }),
      ),
    ).rejects.toThrow('Unknown copyright sweep id column')
  })

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
})
