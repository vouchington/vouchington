import type ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { createSourceFile, findCandidateFunctions } from './ast.mts'
import { scanForTargets } from './targets.mts'

/** Parses a `.tsx` fixture and returns the first candidate function's block body + source file —
 * exactly what `scanForTargets` is called with in `rewrite.mts`. The fixture's function name only
 * needs to satisfy `isComponentOrHookName` (PascalCase); async-ness and `'use client'` are
 * irrelevant here since target scanning is independent of binding eligibility. */
function parseBody(source: string): { body: ts.Block; sourceFile: ts.SourceFile } {
  const sourceFile = createSourceFile(source, 'test.tsx')
  const [candidate] = findCandidateFunctions(sourceFile)
  if (!candidate) throw new Error(`no candidate function found in fixture:\n${source}`)
  return { body: candidate.body, sourceFile }
}

describe('scanForTargets — JSX text', () => {
  it('extracts a lone JSX text child', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <div>Hello world</div>
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-text', rawText: 'Hello world' })
  })

  it('skips (and reports) an element whose children mix text with an expression', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <div>Hello {name}</div>
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(targets).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.reason).toBe('mixed JSX text + expression children')
  })

  it('descends into nested arrow function bodies (e.g. .map callbacks) for text targets', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <div>{items.map(x => <span>Hello world</span>)}</div>
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-text', rawText: 'Hello world' })
  })

  it('ignores an element with no meaningful (non-whitespace) children', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <div>   </div>
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(targets).toEqual([])
    expect(skipped).toEqual([])
  })

  it('decodes HTML character references in JSX text (TS does not decode them itself)', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <div>a &amp; b &lt; c &gt; d</div>
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-text', rawText: 'a & b < c > d' })
  })
})

describe('scanForTargets — JSX attributes', () => {
  it('extracts a bare string-literal placeholder', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <input placeholder="Type here" />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-attr', rawText: 'Type here' })
  })

  it('extracts a bare string-literal tooltip (TooltipButton custom prop, not a native attribute)', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <TooltipButton tooltip="Close player" />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-attr', rawText: 'Close player' })
  })

  it('decodes HTML character references in a bare string-literal attribute', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <input title='Rock &amp; Roll' />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-attr', rawText: 'Rock & Roll' })
  })

  it('does not decode a braced string-literal attribute (plain JS string, not JSX entity syntax)', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <input title={'Rock &amp; Roll'} />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-attr', rawText: 'Rock &amp; Roll' })
  })

  it('extracts a braced string-literal title', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <input title={"Search"} />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-attr', rawText: 'Search' })
  })

  it('extracts a braced no-substitution template literal aria-label', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <input aria-label={\`Search\`} />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'jsx-attr', rawText: 'Search' })
  })

  it('skips (and reports) a template literal with interpolation', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <input aria-label={\`Search \${query}\`} />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(targets).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.reason).toBe('dynamic aria-label expression')
  })

  it('skips (and reports) a ternary of two string literals', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <input aria-label={cond ? 'a' : 'b'} />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(targets).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.reason).toBe('dynamic aria-label expression')
  })

  it('ignores attributes outside the tracked set entirely (no target, no skip)', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      return <input className="foo" />
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(targets).toEqual([])
    expect(skipped).toEqual([])
  })
})

describe('scanForTargets — toast calls', () => {
  it('extracts a single string-literal onSuccess argument', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      onSuccess('Saved successfully')
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'toast-success', rawText: 'Saved successfully' })
  })

  it('skips (and reports) a single non-literal onSuccess argument', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      onSuccess(message)
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(targets).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.reason).toBe('onSuccess non-literal single argument')
  })

  it('silently ignores a two-argument onSuccess call (out of the single-literal-arg pattern)', () => {
    // Neither argument is a string literal here, so there is no hardcoded UI text at risk of
    // being missed — this shape (e.g. `onSuccess(comment, html)`) is simply not the toast-literal
    // pattern this codemod targets, so no target *and* no skip note is the correct behavior.
    const { body, sourceFile } = parseBody(`function Component() {
      onSuccess(comment, html)
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(targets).toEqual([])
    expect(skipped).toEqual([])
  })

  it('extracts a string-literal onError fallback property', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      onError(err, { fallback: 'Something went wrong' })
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({
      kind: 'toast-error-fallback',
      rawText: 'Something went wrong',
    })
  })

  it('skips (and reports) a non-literal onError fallback value', () => {
    const { body, sourceFile } = parseBody(`function Component() {
      onError(err, { fallback: message })
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(targets).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.reason).toBe('onError fallback non-literal value')
  })

  it("never extracts (or reports) sibling properties of onError's options object", () => {
    const { body, sourceFile } = parseBody(`function Component() {
      onError(err, { tags: 'some-tag', fallback: 'Oops' })
    }`)
    const { targets, skipped } = scanForTargets(body, sourceFile)
    expect(skipped).toEqual([])
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ kind: 'toast-error-fallback', rawText: 'Oops' })
  })
})
