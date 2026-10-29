import { describe, expect, it } from 'vitest'
import {
  observeTestCallbackQueryLockWait,
  observeTestMultiCallbackQueryLockWait,
} from '@voucha/test-helpers/postgres-callback-lock-race'

describe('owned PostgreSQL lock observation', () => {
  it('witnesses a callback-backed pool query while its advisory lock is blocked', async () => {
    expect(await observeTestCallbackQueryLockWait()).toBe(42)
  })

  it('witnesses a callback-backed pool query through a multi-wait owner', async () => {
    expect(await observeTestMultiCallbackQueryLockWait()).toBe(42)
  })
})
