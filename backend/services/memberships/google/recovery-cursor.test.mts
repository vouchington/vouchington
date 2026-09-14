import { describe, expect, it } from 'vitest'
import { pageGooglePlayRecoveryItems } from './recovery-cursor.mts'

describe('Google Play recovery sweep pages', () => {
  it('holds a captured high-water mark until a bounded multi-page sweep completes', () => {
    const cursor = {
      previousCursor: '00000000-0000-7000-8000-000000000100',
      previousUpperBound: '00000000-0000-7000-8000-000000000900',
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
