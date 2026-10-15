import { createElement } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createNextDynamicMock,
  flushPendingDynamicImports,
  trackDynamicImport,
  trackDynamicLoader,
} from './next-link-dynamic-mocks'

function deferredModule(): {
  loader: () => Promise<{ default: () => null }>
  finish: () => void
} {
  let finish: () => void = () => {}
  const loader = () =>
    new Promise<{ default: () => null }>(resolve => {
      finish = () => resolve({ default: () => null })
    })
  return { loader, finish: () => finish() }
}

describe('next/dynamic loader lifetime', () => {
  it('reports a loader rejection that settled before the flush and clears it afterward', async () => {
    const error = new Error('dynamic module evaluation failed')
    trackDynamicImport(Promise.reject(error))
    await Promise.resolve()

    await expect(flushPendingDynamicImports()).rejects.toMatchObject({ errors: [error] })
    await expect(flushPendingDynamicImports()).resolves.toBeUndefined()
  })

  it('waits for other loaders before reporting a synchronous loader failure', async () => {
    const error = new Error('dynamic loader threw')
    const pending = deferredModule()
    trackDynamicLoader(() => {
      throw error
    })
    trackDynamicLoader(pending.loader)
    const flush = flushPendingDynamicImports().catch((err: unknown) => err)
    await Promise.resolve()
    pending.finish()
    await expect(flush).resolves.toMatchObject({ errors: [error] })
  })

  it('flush waits for the loader createNextDynamicMock started', async () => {
    const pending = deferredModule()
    try {
      const Dynamic = createNextDynamicMock().default(pending.loader)
      const view = render(createElement(Dynamic))
      view.unmount()

      let flushed = false
      const flush = (async () => {
        await flushPendingDynamicImports()
        flushed = true
      })()
      await Promise.resolve()
      expect(flushed).toBe(false)

      pending.finish()
      await flush
      expect(flushed).toBe(true)
    } finally {
      pending.finish()
    }
  })

  it('flush waits for a loader a stub double starts and then ignores', async () => {
    const pending = deferredModule()
    try {
      trackDynamicLoader(pending.loader)

      let flushed = false
      const flush = (async () => {
        await flushPendingDynamicImports()
        flushed = true
      })()
      await Promise.resolve()
      expect(flushed).toBe(false)

      pending.finish()
      await flush
      expect(flushed).toBe(true)
    } finally {
      pending.finish()
    }
  })
})
