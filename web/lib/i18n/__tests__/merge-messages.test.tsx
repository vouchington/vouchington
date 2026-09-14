import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UiMessagesHydrator } from '../ui-messages-hydrator'
import {
  createMessagesCache,
  getMessagesPromise,
  mergeMessages,
  seedMessages,
} from '../use-translations'

describe('mergeMessages', () => {
  it('seeds the cache when the locale has not been loaded', async () => {
    mergeMessages('merge-seed', { nav: { home: 'Home' } })
    await expect(getMessagesPromise('merge-seed')).resolves.toEqual({ nav: { home: 'Home' } })
  })

  it('merges into a fulfilled cache entry', async () => {
    seedMessages('merge-fulfilled', { nav: { home: 'Home' } })
    mergeMessages('merge-fulfilled', { nav: { search: 'Search' } })
    await expect(getMessagesPromise('merge-fulfilled')).resolves.toEqual({
      nav: { home: 'Home', search: 'Search' },
    })
  })

  it('merges after an in-flight load settles', async () => {
    let resolveLoad!: (catalog: { nav: { home: string } }) => void
    const load = new Promise<{ nav: { home: string } }>(resolve => {
      resolveLoad = resolve
    })
    const cache = createMessagesCache(() => load)
    const pending = cache.getMessagesPromise('de')
    cache.mergeMessages('de', { nav: { extra: 'Extra' } })
    resolveLoad({ nav: { home: 'Home' } })
    const catalog = await pending
    expect(catalog.nav).toEqual(expect.objectContaining({ extra: 'Extra' }))
  })
})

describe('UiMessagesHydrator', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('merges the catalog before rendering children', async () => {
    render(
      <UiMessagesHydrator
        locale='hydrator-test'
        catalog={{ nav: { home: 'Hydrated' } }}
      >
        <div data-testid='child'>ok</div>
      </UiMessagesHydrator>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('ok')
    await expect(getMessagesPromise('hydrator-test')).resolves.toEqual({
      nav: { home: 'Hydrated' },
    })
  })
})
