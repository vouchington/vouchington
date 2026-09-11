export const LOG_OMISSION_MARKER = '\n[...job log middle omitted...]\n'

export function fitDiagnosticWindow(log: string, maxBytes: number): string {
  if (Buffer.byteLength(log) <= maxBytes) return log
  const markerBytes = Buffer.byteLength(LOG_OMISSION_MARKER)
  if (maxBytes <= markerBytes) return takeUtf8Suffix(log, maxBytes)

  const contentBytes = maxBytes - markerBytes
  const headBytes = Math.floor(contentBytes / 3)
  const tailBytes = contentBytes - headBytes
  return takeUtf8Prefix(log, headBytes) + LOG_OMISSION_MARKER + takeUtf8Suffix(log, tailBytes)
}

function takeUtf8Prefix(value: string, maxBytes: number): string {
  let bytes = 0
  let end = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character)
    if (bytes + characterBytes > maxBytes) break
    bytes += characterBytes
    end += character.length
  }
  return value.slice(0, end)
}

function takeUtf8Suffix(value: string, maxBytes: number): string {
  let bytes = 0
  let start = value.length
  while (start > 0) {
    let characterStart = start - 1
    const trailingCodeUnit = value.charCodeAt(characterStart)
    if (trailingCodeUnit >= 0xdc00 && trailingCodeUnit <= 0xdfff && characterStart > 0) {
      const leadingCodeUnit = value.charCodeAt(characterStart - 1)
      if (leadingCodeUnit >= 0xd800 && leadingCodeUnit <= 0xdbff) characterStart -= 1
    }
    const characterBytes = Buffer.byteLength(value.slice(characterStart, start))
    if (bytes + characterBytes > maxBytes) break
    bytes += characterBytes
    start = characterStart
  }
  return value.slice(start)
}
