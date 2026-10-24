import { v7 } from 'uuid'

/** Adjacent randomized UUIDv7 keys isolate cursor pages from concurrent fixtures. */
export function createTestUuidWindow() {
  const prefix = v7().slice(0, -1)
  return {
    firstId: `${prefix}1`,
    secondId: `${prefix}2`,
    thirdId: `${prefix}3`,
  }
}
