import { describe, expect, it } from 'vitest'

import { stripCodeCommentsAndStrings } from './native-source-code-mask.mts'

describe('native source code masking', () => {
  it('preserves source length and newlines while masking nested comments and quoted literals', () => {
    const source = `let visible = key
/* outer
  /* inner */
*/
let string = "hidden \\"value\\""
let character = 'x'`
    const masked = stripCodeCommentsAndStrings(source, false)

    expect(masked).toHaveLength(source.length)
    expect(masked.split('\n')).toHaveLength(source.split('\n').length)
    expect(masked).toContain('let visible = key')
    expect(masked).not.toContain('outer')
    expect(masked).not.toContain('hidden')
  })

  it('keeps C# interpolation expressions while masking literal and escaped-brace text', () => {
    const source =
      'var value = $"hidden {{literal}} {localize(UiMessageKey.CommonCancel, new { nested = 1 })}";'
    const masked = stripCodeCommentsAndStrings(source, true)

    expect(masked).toHaveLength(source.length)
    expect(masked).toContain('localize(UiMessageKey.CommonCancel, new { nested = 1 })')
    expect(masked).not.toContain('hidden')
    expect(masked).not.toContain('literal')
  })

  it('masks escaped characters in C# interpolated-string literal segments', () => {
    const source = 'var value = $"hidden \\"quoted\\" {localize(UiMessageKey.CommonCancel)}";'
    const masked = stripCodeCommentsAndStrings(source, true)

    expect(masked).toHaveLength(source.length)
    expect(masked).toContain('localize(UiMessageKey.CommonCancel)')
    expect(masked).not.toContain('quoted')
  })
})
