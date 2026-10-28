import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UiMessagesHydrator } from '../ui-messages-hydrator'
import { useTranslations } from '../use-translations'
import { UiLocaleProvider } from '../ui-locale-provider'

function HydratedCopy() {
  const t = useTranslations()
  return <p>{t('nav.home')}</p>
}

describe('UiMessagesHydrator', () => {
  it('merges the catalog before rendering translated children', () => {
    render(
      <UiLocaleProvider uiLocale='fr'>
        <UiMessagesHydrator
          locale='fr'
          catalog={{ nav: { home: 'Accueil' } }}
        >
          <HydratedCopy />
        </UiMessagesHydrator>
      </UiLocaleProvider>,
    )
    expect(screen.getByText('Accueil')).toBeInTheDocument()
  })
})
