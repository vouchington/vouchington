import { describe, expect, it } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { computeCrawlOutcome } from '@/components/topics/manage-source/crawl-outcome'
import { getCrawlOutcomeMessage } from './topic-source-crawl-detail-helpers'
import { enMessages, esMessages } from '@ts-shared/ui-messages/locale-catalogs'

function translateOutcome(responseCode: number, itemCount?: number): string {
  const outcome = computeCrawlOutcome(
    responseCode,
    itemCount === undefined ? undefined : { items: Array.from({ length: itemCount }) },
  )
  const message = getCrawlOutcomeMessage(outcome)
  return createTranslator('en', enMessages)(message.key, message.values)
}

describe('getCrawlOutcomeMessage', () => {
  it('renders every non-item outcome in English from the structural outcome', () => {
    expect(translateOutcome(304)).toBe('Not modified')
    expect(translateOutcome(200)).toBe('Success')
    expect(translateOutcome(302)).toBe('Redirect')
    expect(translateOutcome(500)).toBe('Error')
  })

  it('pluralizes item outcomes in English', () => {
    expect(translateOutcome(200, 1)).toBe('1 item')
    expect(translateOutcome(200, 3)).toBe('3 items')
  })

  it.each([
    [304, undefined, 'Sin cambios'],
    [200, undefined, 'Correcto'],
    [302, undefined, 'Redirección'],
    [500, undefined, 'Error'],
    [200, 0, '0 elementos'],
    [200, 1, '1 elemento'],
    [200, 3, '3 elementos'],
  ])('uses the Spanish catalog for %i with %s items', (responseCode, itemCount, expected) => {
    const outcome = computeCrawlOutcome(
      responseCode,
      itemCount === undefined ? undefined : { items: Array.from({ length: itemCount }) },
    )
    const message = getCrawlOutcomeMessage(outcome)
    expect(createTranslator('es', esMessages)(message.key, message.values)).toBe(expected)
  })
})
