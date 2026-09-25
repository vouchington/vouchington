import { describe, expect, it } from 'vitest'
import { decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import { encodeUuidCursorBefore } from './uuid-cursors.mts'

function decodedId(cursor: string): string {
  return decodeUuidCursor(cursor, isSimpleCursor, 'Invalid test cursor').id
}

describe('encodeUuidCursorBefore', () => {
  it('seeks to the UUID immediately below the given one', () => {
    expect(decodedId(encodeUuidCursorBefore('0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b'))).toBe(
      '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6a',
    )
  })

  it('borrows across every UUID group boundary', () => {
    expect(decodedId(encodeUuidCursorBefore('0192a3b5-0000-0000-0000-000000000000'))).toBe(
      '0192a3b4-ffff-ffff-ffff-ffffffffffff',
    )
  })

  it('refuses the nil UUID, which nothing sorts before', () => {
    expect(() => encodeUuidCursorBefore('00000000-0000-0000-0000-000000000000')).toThrow(
      'No UUID sorts before the nil UUID',
    )
  })
})
