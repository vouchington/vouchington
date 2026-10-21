import { v7 } from 'uuid'

/** Three adjacent UUIDv7 keys leave no space for an unrelated cursor row between owned IDs. */
export function createTestOAuthAccountSweepWindow() {
  const prefix = v7().slice(0, -1)
  return {
    afterId: `${prefix}0`,
    firstId: `${prefix}1`,
    secondId: `${prefix}2`,
    upperId: `${prefix}3`,
  }
}
