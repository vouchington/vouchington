import { describe, expect, it } from 'vitest'
import { createSourceFile } from './ast.mts'
import { scanFunctionBindings } from './binding.mts'

describe('scanFunctionBindings — client components', () => {
  it('makes a block-bodied component in a "use client" file eligible in client mode', () => {
    const sourceFile = createSourceFile(
      `'use client'
      function CommentTree() {
        return <div>Hello world</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(skipped).toEqual([])
    expect(eligible).toHaveLength(1)
    expect(eligible[0]).toMatchObject({ mode: 'client', existing: undefined })
    expect(eligible[0]?.candidate.name).toBe('CommentTree')
  })

  it('makes a non-async component eligible in a client file (client mode never requires async)', () => {
    const sourceFile = createSourceFile(
      `'use client'
      function CommentTree() {
        return <div>Hello world</div>
      }`,
      'test.tsx',
    )
    const { eligible } = scanFunctionBindings(sourceFile)
    expect(eligible[0]?.candidate.isAsync).toBe(false)
    expect(eligible[0]?.mode).toBe('client')
  })

  it('reuses an existing local "t" bound to useTranslations() instead of re-injecting', () => {
    const sourceFile = createSourceFile(
      `'use client'
      function CommentTree() {
        const t = useTranslations()
        return <div>Hello world</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(skipped).toEqual([])
    expect(eligible).toHaveLength(1)
    expect(eligible[0]?.existing).toBeDefined()
  })

  it('skips a client-file function whose local "t" is bound to something else (avoids shadowing)', () => {
    const sourceFile = createSourceFile(
      `'use client'
      function CommentTree() {
        const t = someOtherThing()
        return <div>Hello world</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(eligible).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ functionName: 'CommentTree' })
    expect(skipped[0]?.reason).toMatch(/shadowing/)
  })

  it('skips a client-file function whose local "t" is bound to the wrong-mode translator call', () => {
    const sourceFile = createSourceFile(
      `'use client'
      function CommentTree() {
        const t = getTranslations()
        return <div>Hello world</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(eligible).toEqual([])
    expect(skipped).toHaveLength(1)
  })
})

describe('scanFunctionBindings — server components', () => {
  it('makes an already-async component eligible in server mode (no "use client")', () => {
    const sourceFile = createSourceFile(
      `async function PostPage() {
        return <div>Hello world</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(skipped).toEqual([])
    expect(eligible).toHaveLength(1)
    expect(eligible[0]).toMatchObject({ mode: 'server', existing: undefined })
  })

  it('skips a non-async component with no "use client" directive (would need async injection)', () => {
    const sourceFile = createSourceFile(
      `function PostPage() {
        return <div>Hello world</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(eligible).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ functionName: 'PostPage' })
    expect(skipped[0]?.reason).toMatch(/not a client file and function is not already async/)
  })

  it('reuses an existing local "t" bound to getTranslations() instead of re-injecting', () => {
    const sourceFile = createSourceFile(
      `async function PostPage() {
        const t = await getTranslations()
        return <div>Hello world</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(skipped).toEqual([])
    expect(eligible).toHaveLength(1)
    expect(eligible[0]?.existing).toBeDefined()
  })
})

describe('scanFunctionBindings — per-function independence', () => {
  it('judges each candidate function in a file independently', () => {
    const sourceFile = createSourceFile(
      `'use client'
      function Eligible() {
        return <div>Hello world</div>
      }
      function AlsoEligible() {
        const t = someOtherThing()
        return <div>Goodbye world</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(eligible.map(b => b.candidate.name)).toEqual(['Eligible'])
    expect(skipped.map(s => s.functionName)).toEqual(['AlsoEligible'])
  })
})

describe('scanFunctionBindings — candidates with no extraction targets', () => {
  it('drops a non-async, non-client component with zero translatable strings instead of flagging it', () => {
    const sourceFile = createSourceFile(
      `function Button({ children }: { children: React.ReactNode }) {
        return <button type='button'>{children}</button>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(eligible).toEqual([])
    expect(skipped).toEqual([])
  })

  it('still flags a non-async, non-client component that has a real extraction target', () => {
    const sourceFile = createSourceFile(
      `function PageHeader() {
        return <h1>Settings</h1>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(eligible).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ functionName: 'PageHeader' })
  })

  it('still flags a non-async, non-client component whose only target is ambiguous (mixed text + expr)', () => {
    const sourceFile = createSourceFile(
      `function Greeting({ name }: { name: string }) {
        return <div>Hello {name}</div>
      }`,
      'test.tsx',
    )
    const { eligible, skipped } = scanFunctionBindings(sourceFile)
    expect(eligible).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ functionName: 'Greeting' })
  })
})
