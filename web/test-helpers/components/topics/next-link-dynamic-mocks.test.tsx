import { createElement } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createNextDynamicMock,
  flushPendingDynamicImports,
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
