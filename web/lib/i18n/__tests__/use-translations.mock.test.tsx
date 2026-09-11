import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { useTranslations } from '@/lib/i18n/use-translations'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'

// `loadMessages` is the genuinely-async, code-split dynamic import (see use-translations.tsx's
// doc comment). This test always resolves 'en', so it's mocked to skip the real per-locale
// dynamic import while keeping `createTranslator` and every other export real. The mock still
// returns a Promise, so the Suspense/`use()` behavior under test is unaffected.
vi.mock(import('@ts-shared/ui-messages'), async () => {
  const actual =
    await vi.importActual<typeof import('@ts-shared/ui-messages')>('@ts-shared/ui-messages')
  return {
    ...actual,
    loadMessages: vi.fn<VitestLooseMock>(() => Promise.resolve(enMessages)),
  }
})

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
})
