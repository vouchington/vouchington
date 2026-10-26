import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTranslations } from '@/lib/i18n/use-translations'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'

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
