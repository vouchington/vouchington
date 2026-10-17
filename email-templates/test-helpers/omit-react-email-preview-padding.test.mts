import { describe, expect, it } from 'vitest'
import { omitReactEmailPreviewPadding } from './omit-react-email-preview-padding.mts'

const previousFiller = '\u00A0\u200C\u200B\u200D\u200E\u200F\uFEFF'.repeat(4)
const currentFiller = '\u00A0\u200C\u200B\u200D\uFEFF'.repeat(4)
const laterFiller = '\u00A0\u2060\uFEFF'.repeat(4)

function previewHtml(padding: string, body = '<p>Hello</p>'): string {
  return `<div style="display:none" data-skip-in-text="true">
      Price change
      <div>
        ${padding}
      </div>
    </div>
    ${body}`
}

const withoutPadding = `<div style="display:none" data-skip-in-text="true">
      Price change
    </div>
    <p>Hello</p>`

describe('omitReactEmailPreviewPadding', () => {
  it.each([
    ['previous direction-mark filler', previousFiller],
    ['current filler', currentFiller],
    ['later format-character filler', laterFiller],
  ])('drops the %s and keeps the preview text', (_name, padding) => {
    expect(omitReactEmailPreviewPadding(previewHtml(padding))).toBe(withoutPadding)
  })

  it('keeps a nested div that contains visible copy', () => {
    const html = `<div data-skip-in-text="true">
      Price change
      <div>Keep this</div>
    </div>`

    expect(omitReactEmailPreviewPadding(html)).toBe(html)
  })

  it('keeps a no-break space in the message body', () => {
    const html = previewHtml(currentFiller, '<p>Hello\u00A0there</p>')

    expect(omitReactEmailPreviewPadding(html)).toContain('Hello\u00A0there')
    expect(omitReactEmailPreviewPadding(html)).not.toContain(currentFiller)
  })

  it('leaves html without a preview unchanged', () => {
    const html = '<p>Hello</p>'

    expect(omitReactEmailPreviewPadding(html)).toBe(html)
  })
})
