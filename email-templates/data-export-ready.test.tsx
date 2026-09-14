import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emailCopy } from './catalog-copy.mts'
import { renderDataExportReadyEmail } from './data-export-ready-renderer.mts'
import DataExportReadyEmail from './data-export-ready.tsx'

describe('renderDataExportReadyEmail', () => {
  it('owns the timeframe sentence in the catalog', () => {
    expect(emailCopy('fr', 'data-export-ready')('timeframe')).toBe(
      'Veuillez télécharger vos données avant la fin de ce délai.',
    )
  })

  it('renders the expected subject and snapshots', async () => {
    const result = await renderDataExportReadyEmail(DataExportReadyEmail.PreviewProps!)

    expect(result.subject).toBe('Your Data Export is Ready')
    await expect(result.html).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/data-export-ready.html', import.meta.url)),
    )
    await expect(result.text).toMatchFileSnapshot(
      fileURLToPath(new URL('__snapshots__/data-export-ready.txt', import.meta.url)),
    )
  })

  it('includes the download URL and plural day wording', async () => {
    const result = await renderDataExportReadyEmail({
      downloadUrl: 'https://voucha.ai/downloads/export-123',
      expiresInDays: 7,
    })

    expect(result.html).toContain('https://voucha.ai/downloads/export-123')
    expect(result.html).toContain('days')
    expect(result.text).toContain('https://voucha.ai/downloads/export-123')
    expect(result.text).toContain('7 days')
  })

  it('renders singular day wording', async () => {
    const result = await renderDataExportReadyEmail({
      downloadUrl: 'https://voucha.ai/downloads/preview',
      expiresInDays: 1,
    })

    expect(result.html).not.toContain('days')
    expect(result.text).toContain('1 day')
  })

  it('renders localized French copy when requested', async () => {
    const result = await renderDataExportReadyEmail({
      downloadUrl: 'https://voucha.ai/downloads/export-123',
      expiresInDays: 7,
      uiLocale: 'fr',
    })

    expect(result.subject).toBe('Votre export de données est prêt')
    expect(result.html).toContain('Télécharger vos données')
    expect(result.html).toContain('jours')
    expect(result.text).toContain('7 jours')
    expect(result.text).toContain("L'équipe Voucha")
  })
})
