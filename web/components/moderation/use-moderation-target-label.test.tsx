import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import { useModerationTargetLabel } from './use-moderation-target-label'

describe('moderation entity type labels', () => {
  it('shows nouns for every API entity type in the active locale', () => {
    seedMessages('es', esMessages)
    render(
      <UiLocaleProvider uiLocale='es'>
        <span>
          <TargetLabel code='post' />
        </span>
        <span>
          <TargetLabel code='comment' />
        </span>
        <span>
          <TargetLabel code='user' />
        </span>
        <span>
          <TargetLabel code='url_hostname' />
        </span>
        <span>
          <TargetLabel code='rss_feed_item' />
        </span>
      </UiLocaleProvider>,
    )

    for (const label of [
      'Publicación',
      'Comentario',
      'Usuario',
      'Nombre de host',
      'elemento de feed',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    for (const code of ['post', 'comment', 'user', 'url_hostname', 'rss_feed_item', 'Publicar']) {
      expect(screen.queryByText(code)).not.toBeInTheDocument()
    }
  })
})

function TargetLabel({ code }: { code: string }) {
  const label = useModerationTargetLabel()
  return <span>{label(code)}</span>
}

describe('moderation target fallback labels', () => {
  it('preserves factual titles', () => {
    render(<TargetLabel code='A factual title' />)
    expect(screen.getByText('A factual title')).toBeInTheDocument()
  })
  it.each([
    ['post', 'Publicación'],
    ['user', 'Usuario'],
    ['url_hostname', 'Nombre de host'],
    ['rss_feed_item', 'elemento de feed'],
    ['mass_report_suspected', 'Posible abuso de reportes masivos'],
    ['velocity_spike', 'Pico de velocidad de votos'],
    ['ip_correlation', 'Correlación de IP'],
    ['[deleted content]', 'Contenido eliminado'],
    ['[Private content]', 'Contenido privado'],
  ])('renders %s as localized display text', (code, expected) => {
    seedMessages('es', esMessages)
    render(
      <UiLocaleProvider uiLocale='es'>
        <TargetLabel code={code} />
      </UiLocaleProvider>,
    )
    expect(screen.getByText(expected)).toBeInTheDocument()
    expect(screen.queryByText(code)).not.toBeInTheDocument()
  })
})
