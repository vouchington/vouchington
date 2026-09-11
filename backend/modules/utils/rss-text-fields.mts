import { decodeHtmlEntities } from '@ts-shared/utils/html'

export function firstVisibleRssTextField(fields: unknown[]): string {
  for (const field of fields) {
    if (typeof field === 'string' && hasVisibleRssText(field)) return field
  }
  return ''
}

export function hasVisibleRssText(value: string): boolean {
  return visibleRssText(value).length > 0
}

export function visibleRssText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, ' $1 ')
      .replace(/<img\b[^>]*\balt='([^']*)'[^>]*>/gi, ' $1 ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
