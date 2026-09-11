import { describe, expect, it } from 'vitest'
import { UNIVERSAL_WORKER_DEFINITIONS } from '../universal-workers.mts'
import { UNIVERSAL_WORKER_QUEUE_NAMES } from '@modules/worker-queue-inventory'

describe('universal workers', () => {
  it('matches the canonical universal queue inventory exactly', () => {
    const names = UNIVERSAL_WORKER_DEFINITIONS.map(d => d.queueName)
    expect(names).toEqual(UNIVERSAL_WORKER_QUEUE_NAMES)
  })

  it('heartbeat definition has a load function', () => {
    const heartbeatDef = UNIVERSAL_WORKER_DEFINITIONS.find(d => d.queueName === 'heartbeat')
    expect(heartbeatDef).toBeDefined()
    expect(typeof heartbeatDef!.load).toBe('function')
  })

  it('heartbeat is not excluded by QUEUES filter (no requiresExplicitInclusion)', () => {
    const heartbeatDef = UNIVERSAL_WORKER_DEFINITIONS.find(d => d.queueName === 'heartbeat')
    expect(heartbeatDef!.requiresExplicitInclusion).toBeFalsy()
  })

  // Not `await loadUniversalWorkers()`: that resolves the real `heartbeat` worker singleton,
  // attaching it to the shared `backend-data-stores` Vitest fork (`isolate: false`) with no way to
  // detach it again — `backend/workers/heartbeat/workers.test.mts` needs that same singleton left
  // live and closes it itself in its own `afterAll`. Asserting the lazy-import shape instead proves
  // the definition points at the right module without attaching anything. Vite's SSR transform
  // rewrites the `@workers/...` alias in `load.toString()` to a resolved absolute path, so check the
  // directory and export name as separate substrings rather than the aliased specifier — matching
  // `expectLazyImport` in backend/entrypoints/worker-io/worker-definitions.test.mts.
  it('the universal worker definition lazily imports the heartbeat worker', () => {
    const [definition] = UNIVERSAL_WORKER_DEFINITIONS
    const loadSource = definition!.load.toString()
    expect(loadSource).toContain('heartbeat/workers')
    expect(loadSource).toMatch(/\bheartbeat\b/)
  })
})
