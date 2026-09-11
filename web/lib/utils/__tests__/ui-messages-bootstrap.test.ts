import { describe, expect, it } from 'vitest'
import { serializeUiMessagesBootstrapScript } from '../ui-messages-bootstrap'

describe('serializeUiMessagesBootstrapScript', () => {
  it('serializes the locale and complete catalog as a window bootstrap assignment', () => {
    const script = serializeUiMessagesBootstrapScript({
      locale: 'en',
      catalog: { nav: { home: 'Home' } },
    })

    expect(script).toBe('window.__UI_MESSAGES__={"locale":"en","catalog":{"nav":{"home":"Home"}}}')
  })

  it('escapes HTML script terminators inside translated strings', () => {
    const script = serializeUiMessagesBootstrapScript({
      locale: 'en',
      catalog: { nav: { home: 'Home</script><script>alert(1)</script>' } },
    })

    // Built from character codes, not typed literally, so the escaped form (a literal backslash
    // followed by "u003c") can't be silently swapped back into a raw "<" by any text-processing
    // layer between here and disk.
    const backslash = String.fromCodePoint(92)
    const escapedLt = `${backslash}u003c`

    expect(script).toBe(
      `window.__UI_MESSAGES__={"locale":"en","catalog":{"nav":{"home":"Home${escapedLt}/script>` +
        `${escapedLt}script>alert(1)${escapedLt}/script>"}}}`,
    )
    expect(script).not.toContain('</script>')
    expect(script).not.toContain('<script>')
  })

  it('escapes Unicode line and paragraph separators inside translated strings', () => {
    const lineSeparator = String.fromCodePoint(0x20_28)
    const paragraphSeparator = String.fromCodePoint(0x20_29)
    const script = serializeUiMessagesBootstrapScript({
      locale: 'en',
      catalog: { nav: { home: `Home${lineSeparator}${paragraphSeparator}` } },
    })

    // Same character-code construction as above, for the same reason.
    const backslash = String.fromCodePoint(92)
    const escapedSeparators = `${backslash}u2028${backslash}u2029`

    expect(script).toBe(
      `window.__UI_MESSAGES__={"locale":"en","catalog":{"nav":{"home":"Home${escapedSeparators}"}}}`,
    )
    expect(script).not.toContain(lineSeparator)
    expect(script).not.toContain(paragraphSeparator)
  })
})
