export function isAllowedAttribute(tagName: string, name: string): boolean {
  if (name === 'style' || /^on/i.test(name)) return false
  if (name === 'class' || name === 'title') return true
  if (name.startsWith('aria-') || name.startsWith('data-')) return true

  if (tagName === 'a') return name === 'href' || name === 'rel' || name === 'target'
  if (tagName === 'details') return name === 'open'
  if (tagName === 'td' || tagName === 'th') return name === 'colspan' || name === 'rowspan'

  return (
    tagName === 'img' &&
    (name === 'src' ||
      name === 'alt' ||
      name === 'width' ||
      name === 'height' ||
      name === 'loading' ||
      name === 'decoding' ||
      name === 'fetchpriority')
  )
}
