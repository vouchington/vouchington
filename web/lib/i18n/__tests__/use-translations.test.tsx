import { Suspense, use, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { EnCatalog } from '@ts-shared/ui-messages'
import { describe, expect, it, vi } from 'vitest'
import {
  createMessagesCache,
  getMessagesPromise,
  useTranslations,
} from '@/lib/i18n/use-translations'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { ErrorBoundary } from '@/components/ui/error-boundary'

function Consumer() {
  const t = useTranslations()
  return (
    <div data-testid='translated'>
      {t('settings.language.currentLabel', { language: 'English' })}
    </div>
  )
}

describe('useTranslations', () => {
  it('suspends on the locale catalog load and returns a working translator', async () => {
    await act(async () => {
      render(
        <UiLocaleProvider uiLocale='en'>
          <Suspense fallback={<div>Loading</div>}>
            <Consumer />
          </Suspense>
        </UiLocaleProvider>,
      )
    })

    expect(await screen.findByTestId('translated')).toHaveTextContent('Current language: English')
  })

  it('keeps a rejected load stable until explicit retry', async () => {
    let attempts = 0
    const loadMessages = vi.fn<(locale: string) => Promise<EnCatalog>>((locale: string) => {
      expect(locale).toBe('es')
      attempts += 1
      return attempts === 1
        ? Promise.reject(new Error('localization unavailable'))
        : Promise.resolve({ nav: { home: 'Inicio' } })
    })
    const cache = createMessagesCache(loadMessages)

    const firstAttempt = cache.getMessagesPromise('es')
    await expect(firstAttempt).rejects.toThrow('localization unavailable')
    expect(cache.getMessagesPromise('es')).toBe(firstAttempt)
    expect(attempts).toBe(1)
    cache.invalidateMessages('es')
    await expect(cache.getMessagesPromise('es')).resolves.toEqual({ nav: { home: 'Inicio' } })
    expect(attempts).toBe(2)
  })

  it('does not fetch or warn during React replay, then makes one request on reset', async () => {
    let rejectLoad!: (error: Error) => void
    const firstLoad = new Promise<EnCatalog>((_resolve, reject) => {
      rejectLoad = reject
    })
    const loadMessages = vi.fn<() => Promise<EnCatalog>>()
    loadMessages.mockReturnValueOnce(firstLoad)
    loadMessages.mockResolvedValueOnce({ nav: { home: 'Inicio' } })
    const cache = createMessagesCache(loadMessages)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    function CachedConsumer() {
      use(cache.getMessagesPromise('es'))
      return <div>Recovered</div>
    }

    function RetryHarness() {
      const [attempt, setAttempt] = useState(0)
      return (
        <ErrorBoundary
          key={attempt}
          fallback={
            <button
              type='button'
              onClick={() => {
                cache.invalidateMessages('es')
                setAttempt(attempt + 1)
              }}
            >
              Try again
            </button>
          }
        >
          <Suspense fallback={<div>Loading</div>}>
            <CachedConsumer />
          </Suspense>
        </ErrorBoundary>
      )
    }

    try {
      const renderTree = () => <RetryHarness />
      const view = render(renderTree())
      expect(loadMessages).toHaveBeenCalledTimes(1)

      await act(async () => rejectLoad(new Error('localization unavailable')))
      view.rerender(renderTree())
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
      expect(loadMessages).toHaveBeenCalledTimes(1)

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
      expect(loadMessages).toHaveBeenCalledTimes(2)
      expect(await screen.findByText('Recovered')).toBeInTheDocument()
      const logged = [...consoleError.mock.calls, ...consoleWarn.mock.calls]
        .flat()
        .map(String)
        .join(' ')
      expect(logged).not.toMatch(/uncached promise/i)
    } finally {
      consoleError.mockRestore()
      consoleWarn.mockRestore()
    }
  })

  it('accepts a seed after a failed browser load', async () => {
    let attempts = 0
    const loadMessages = vi.fn<() => Promise<EnCatalog>>(() => {
      attempts += 1
      return Promise.reject(new Error('localization unavailable'))
    })
    const cache = createMessagesCache(loadMessages)

    await expect(cache.getMessagesPromise('pt')).rejects.toThrow('localization unavailable')
    cache.seedMessages('pt', { nav: { home: 'Início' } })
    await expect(cache.getMessagesPromise('pt')).resolves.toEqual({ nav: { home: 'Início' } })
    expect(attempts).toBe(1)
  })

  it('recovers a pending merge when the browser load rejects', async () => {
    let rejectLoad!: (error: Error) => void
    const pendingLoad = new Promise<never>((_resolve, reject) => {
      rejectLoad = reject
    })
    const loadMessages = vi.fn<() => Promise<EnCatalog>>(() => pendingLoad)
    const cache = createMessagesCache(loadMessages)

    const pending = cache.getMessagesPromise('fr')
    cache.mergeMessages('fr', { nav: { home: 'Accueil' } })
    rejectLoad(new Error('localization unavailable'))

    await expect(pending).rejects.toThrow('localization unavailable')
    await Promise.resolve()
    await expect(cache.getMessagesPromise('fr')).resolves.toEqual({ nav: { home: 'Accueil' } })
    expect(loadMessages).toHaveBeenCalledTimes(1)
  })
})
