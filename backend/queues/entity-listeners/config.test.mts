import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_RECONCILIATION_INTERVAL_SECONDS,
  getEntityListenerReconciliationIntervalSeconds,
} from './config.mts'

describe('entity listener reconciliation config', () => {
  const original = process.env.ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS

  afterEach(() => {
    if (original === undefined) delete process.env.ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS
    else process.env.ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS = original
  })

  it('defaults to hourly and accepts configured minute multiples', () => {
    delete process.env.ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS
    expect(getEntityListenerReconciliationIntervalSeconds()).toBe(
      DEFAULT_RECONCILIATION_INTERVAL_SECONDS,
    )
    process.env.ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS = '1800'
    expect(getEntityListenerReconciliationIntervalSeconds()).toBe(1800)
  })

  it.each(['299', '301', '86460', 'not-a-number'])('rejects invalid interval %s', interval => {
    process.env.ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS = interval
    expect(() => getEntityListenerReconciliationIntervalSeconds()).toThrow(
      'ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS',
    )
  })
})
