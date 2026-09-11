import {
  maskBlockComment,
  maskLineComment,
  maskQuotedLiteral,
} from './native-source-code-mask-segments.mts'
import { maskCsharpInterpolatedString } from './native-source-code-mask-csharp.mts'

export function stripCodeCommentsAndStrings(
  source: string,
  preserveCsharpInterpolation: boolean,
): string {
  let result = ''
  let index = 0
  while (index < source.length) {
    const character = source[index]!
    const next = source[index + 1]
    if (character === '/' && next === '/') {
      const segment = maskLineComment(source, index)
      result += segment.text
      index = segment.endIndex
    } else if (character === '/' && next === '*') {
      const segment = maskBlockComment(source, index)
      result += segment.text
      index = segment.endIndex
    } else if (preserveCsharpInterpolation && character === '$' && next === '"') {
      const segment = maskCsharpInterpolatedString(source, index)
      result += segment.text
      index = segment.endIndex
    } else if (character === '"' || character === "'") {
      const segment = maskQuotedLiteral(source, index, character)
      result += segment.text
      index = segment.endIndex
    } else {
      result += character
      index += 1
    }
  }
  return result
}
