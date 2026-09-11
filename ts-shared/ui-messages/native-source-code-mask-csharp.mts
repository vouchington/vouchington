type MaskedSegment = Readonly<{
  text: string
  endIndex: number
}>

export function maskCsharpInterpolatedString(source: string, startIndex: number): MaskedSegment {
  let text = '  '
  let index = startIndex + 2
  let interpolationDepth = 0
  while (index < source.length) {
    const character = source[index]!
    const next = source[index + 1]
    if (interpolationDepth === 0) {
      if (character === '"') {
        text += ' '
        index += 1
        break
      }
      if (character === '{' && next === '{') {
        text += '  '
        index += 2
      } else if (character === '{') {
        interpolationDepth = 1
        text += ' '
        index += 1
      } else if (character === '\\') {
        text += '  '
        index += 2
      } else {
        text += character === '\n' ? '\n' : ' '
        index += 1
      }
    } else {
      if (character === '{') interpolationDepth += 1
      if (character === '}') interpolationDepth -= 1
      text += interpolationDepth === 0 ? ' ' : character
      index += 1
    }
  }
  return { text, endIndex: index }
}
