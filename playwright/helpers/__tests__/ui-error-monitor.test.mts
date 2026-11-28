import { describe, expect, it } from 'vitest'
import type { BrowserContext } from '@playwright/test'
import { monitorUiErrors, type UiErrorMonitorOptions } from '../ui-error-monitor.mts'

type Listener = (response: unknown) => void
type Binding = (source: unknown, record: unknown) => void

function createFakeContext() {
  const listeners = new Set<Listener>()
  let binding: Binding | undefined
  const context = {
    addInitScript: () => Promise.resolve(),
    exposeBinding: (_name: string, handler: Binding) => {
      binding = handler
      return Promise.resolve()
    },
    off: (_event: string, listener: Listener) => listeners.delete(listener),
    on: (_event: string, listener: Listener) => listeners.add(listener),
  }
  return {
    context: context as unknown as BrowserContext,
    respond(status: number, url: string) {
      for (const listener of listeners) {
        listener({
          request: () => ({ resourceType: () => 'fetch' }),
          status: () => status,
          url: () => url,
        })
      }
    },
    record(kind: string, text: string) {
      binding?.({}, { kind, text, url: 'http://localhost:3000/x' })
    },
  }
}

async function failuresFor(
  options: UiErrorMonitorOptions,
  act: (fake: ReturnType<typeof createFakeContext>) => void,
) {
  const fake = createFakeContext()
  const monitor = await monitorUiErrors(fake.context, options)
  act(fake)
  return monitor.failures()
}

describe('monitorUiErrors', () => {
  it('reports same-origin 5xx responses with status and resource type', async () => {
    const failures = await failuresFor({}, fake => {
      fake.respond(503, 'http://localhost:2900/api/things')
    })
    expect(failures).toStrictEqual([
      'Same-origin 5xx response: 503 fetch http://localhost:2900/api/things',
    ])
  })

  it('ignores 404s, external 5xx responses and expected server errors', async () => {
    const failures = await failuresFor(
      { expectedServerErrors: [{ pattern: /\/api\/flaky/, reason: 'asserts the 500 path' }] },
      fake => {
        fake.respond(404, 'http://localhost:3000/missing')
        fake.respond(500, 'https://example.com/thing')
        fake.respond(500, 'http://localhost:2900/api/flaky')
      },
    )
    expect(failures).toStrictEqual([])
  })

  it('reports error toasts and error pages until a reasoned opt-out allows them', async () => {
    const record = (fake: ReturnType<typeof createFakeContext>) => {
      fake.record('error-toast', 'Could not save')
      fake.record('error-page', 'Something went wrong')
    }
    expect(await failuresFor({}, record)).toHaveLength(2)
    expect(await failuresFor({ allowErrorToasts: 'asserts failure toast' }, record)).toStrictEqual([
      'Error boundary page rendered at http://localhost:3000/x: Something went wrong',
    ])
    expect(
      await failuresFor(
        { allowErrorPage: 'renders the page', allowErrorToasts: 'asserts failure toast' },
        record,
      ),
    ).toStrictEqual([])
  })
})
