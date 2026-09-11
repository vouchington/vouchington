import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StructuredDataScript } from './structured-data-script'

describe('StructuredDataScript', () => {
  it('renders escaped JSON-LD with data-pw', () => {
    const { container } = render(
      <StructuredDataScript
        data={{ '@type': 'Thing', name: '<script>unsafe</script>' }}
        nonce='nonce-123'
      />,
    )

    const script = container.querySelector<HTMLScriptElement>('[data-pw="structured-data-script"]')
    expect(script).not.toBeNull()
    expect(script?.id).toBe('ld-Thing')
    expect(script?.nonce).toBe('nonce-123')
    expect(script?.innerHTML).toContain(String.raw`\u003cscript>unsafe\u003c/script>`)
  })

  it('escapes Unicode line and paragraph separators in JSON-LD', () => {
    const lineSeparator = String.fromCodePoint(0x20_28)
    const paragraphSeparator = String.fromCodePoint(0x20_29)
    const { container } = render(
      <StructuredDataScript
        data={{ '@type': 'Thing', name: `line${lineSeparator}paragraph${paragraphSeparator}` }}
        nonce='nonce-123'
      />,
    )

    const script = container.querySelector<HTMLScriptElement>('[data-pw="structured-data-script"]')
    expect(script?.innerHTML).toContain(`line\\u2028paragraph\\u2029`)
  })
})
