import { describe, expect, it } from 'vitest'
import {
  advanceGooglePlayRecoverySweep,
  beginGooglePlayRecoverySweep,
  pageGooglePlayRecoveryItems,
} from './recovery-cursor.mts'

describe('Google Play recovery sweep pages', () => {
  it.each(['active_sources', 'notifications', 'acknowledgements'] as const)(
    'rejects stale reset replay and admits a fresh %s sweep',
    async cursorId => {
      const findUpperBound = async () => '00000000-0000-7000-8000-000000000900'
      const first = await beginGooglePlayRecoverySweep({ cursorId, findUpperBound })
      const completed = { ...first, cursorId, nextCursor: null, completesSweep: true }
      await expect(advanceGooglePlayRecoverySweep(completed)).resolves.toBe(true)
      await expect(advanceGooglePlayRecoverySweep(completed)).resolves.toBe(false)

      const next = await beginGooglePlayRecoverySweep({ cursorId, findUpperBound })
      expect(next.previousCursor).toBeNull()
      expect(next.previousUpperBound).toBeNull()
      expect(next.previousRevision).not.toBe(first.previousRevision)
      await expect(
        advanceGooglePlayRecoverySweep({
          ...next,
          cursorId,
          nextCursor: null,
          completesSweep: true,
        }),
      ).resolves.toBe(true)
    },
  )

  it('holds a captured high-water mark until a bounded multi-page sweep completes', () => {
    const cursor = {
      previousCursor: '00000000-0000-7000-8000-000000000100',
      previousUpperBound: '00000000-0000-7000-8000-000000000900',
      previousRevision: '1',
      sweepUpperBound: '00000000-0000-7000-8000-000000000900',
    }

    expect(
      pageGooglePlayRecoveryItems(
        cursor,
        [
          { id: '00000000-0000-7000-8000-000000000101' },
          { id: '00000000-0000-7000-8000-000000000102' },
          { id: '00000000-0000-7000-8000-000000000103' },
        ],
        2,
      ),
    ).toMatchObject({
      nextCursor: '00000000-0000-7000-8000-000000000102',
      sweepUpperBound: cursor.sweepUpperBound,
      completesSweep: false,
      items: [
        { id: '00000000-0000-7000-8000-000000000101' },
        { id: '00000000-0000-7000-8000-000000000102' },
      ],
    })
  })

  it('marks the final page for an atomic cursor reset before later inserts begin a new sweep', () => {
    expect(
      pageGooglePlayRecoveryItems(
        {
          previousCursor: '00000000-0000-7000-8000-000000000102',
          previousUpperBound: '00000000-0000-7000-8000-000000000900',
          previousRevision: '1',
          sweepUpperBound: '00000000-0000-7000-8000-000000000900',
        },
        [{ id: '00000000-0000-7000-8000-000000000103' }],
        2,
      ),
    ).toMatchObject({
      nextCursor: '00000000-0000-7000-8000-000000000103',
      completesSweep: true,
    })
  })
})
