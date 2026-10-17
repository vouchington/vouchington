// React Email owns the hidden Preview filler and changes its characters between
// releases. HTML snapshots pin the template markup, not that filler.
const previewPaddingDiv =
  /(<div\b[^>]*\bdata-skip-in-text="true"[^>]*>[\s\S]*?)<div\b[^>]*>([\s\S]*?)<\/div>/gu

export function omitReactEmailPreviewPadding(html: string): string {
  previewPaddingDiv.lastIndex = 0
  return html.replace(previewPaddingDiv, (match, prefix: string, inner: string) => {
    if (inner.replace(/[\u00A0\p{Cf}]/gu, '').trim() !== '') return match
    return prefix.trimEnd()
  })
}
