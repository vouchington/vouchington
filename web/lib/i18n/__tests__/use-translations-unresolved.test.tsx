import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { seedMessages, useTranslations } from '@/lib/i18n/use-translations'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'

function SelectedCatalogMissConsumer() {
  const t = useTranslations()
  return (
    <div data-testid='missing'>
      <span data-testid='missing-copy'>
        {t('extracted.login.page.signInOrCreateAccount_c29dcc85')}
      </span>
      <span data-testid='present-copy'>{t('nav.home')}</span>
    </div>
  )
}

describe('useTranslations unresolved keys', () => {
  it('degrades a selected-catalog miss instead of throwing', async () => {
    seedMessages('pt', { nav: { home: 'Início' } })

    await act(async () => {
      render(
        <UiLocaleProvider uiLocale='pt'>
          <Suspense fallback={<div>Loading</div>}>
            <SelectedCatalogMissConsumer />
          </Suspense>
        </UiLocaleProvider>,
      )
    })

    expect(await screen.findByTestId('missing-copy')).toHaveTextContent('')
    expect(screen.getByTestId('present-copy')).toHaveTextContent('Início')
  })
})
