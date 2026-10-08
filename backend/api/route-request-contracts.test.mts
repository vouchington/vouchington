import { describe, expect, it, vi } from 'vitest'
import contracts from '../../api-fixtures/v1/request-contracts.json' with { type: 'json' }
import { REQUEST_CONTRACT_EXEMPTIONS as EXEMPTIONS } from './request-contract-exemptions.mts'

// Other API tests can preload index.mts in this shared Vitest fork. Reload the graph so this
// inventory observes registration even when those tests ran first; no HTTP test-server import.
vi.resetModules()
const { default: app } = await import('./app.mts')
const registered = new Set<string>()
const originalRoute = app.route
app.route = path => {
  const builder = originalRoute.call(app, path)
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const originalMethod = builder[method]
    builder[method] = (...args: Parameters<typeof originalMethod>) => {
      registered.add(`${method.toUpperCase()}:${path}`)
      Reflect.apply(originalMethod, builder, args)
      return builder
    }
  }
  return builder
}
try {
  await import('./index.mts')
} finally {
  app.route = originalRoute
}

const operations = new Set(Object.keys(contracts.operations))

describe('registered route request contracts', () => {
  it('covers every registered route exactly once with a contract or reasoned exemption', () => {
    const uncoveredOrDuplicated = [...registered].filter(
      key => operations.has(key) === Object.hasOwn(EXEMPTIONS, key),
    )
    expect(uncoveredOrDuplicated.toSorted()).toEqual([])
  })

  it('keeps every request and response contract attached to a registered route', () => {
    for (const entries of [contracts.operations, contracts.responses, contracts.adminResponses]) {
      expect(
        Object.keys(entries)
          .filter(key => !registered.has(key))
          .toSorted(),
      ).toEqual([])
    }
  })

  it('keeps every exemption attached to a registered route and caps API v1 exemptions', () => {
    expect(
      Object.keys(EXEMPTIONS)
        .filter(key => !registered.has(key))
        .toSorted(),
    ).toEqual([])
    expect(
      Object.keys(EXEMPTIONS).filter(key => key.split(':')[1]?.startsWith('/api/v1/')).length,
    ).toBeLessThanOrEqual(56)
  })
})
