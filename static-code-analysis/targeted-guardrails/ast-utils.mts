import { parseForESLint } from '@typescript-eslint/parser'

export interface UnknownNode {
  type?: string
  range?: [number, number]
  loc?: { start: { line: number }; end: { line: number } }
  [key: string]: unknown
}

/**
 * The root AST node returned by parseSource(): the ESTree Program plus the comments/tokens arrays
 * `@typescript-eslint/parser` attaches alongside it.
 */
export type ParsedAst = UnknownNode & { comments?: UnknownNode[]; tokens?: UnknownNode[] }

interface ParseResult {
  ast: ParsedAst
}

export function parseSource(code: string): ParseResult {
  const result = parseForESLint(code, {
    comment: true,
    ecmaVersion: 'latest',
    loc: true,
    range: true,
    sourceType: 'module',
  }) as unknown as ParseResult
  // @typescript-eslint/parser force-enables `tokens: true` regardless of the options above
  // (parser.js hardcodes it), and every token duplicates a slice of the source string
  // (node-utils.js builds each token via `ast.text.slice(start, end)`) — roughly half of a parsed
  // AST's retained size. Nothing in this repo reads `ast.tokens`; drop the reference immediately
  // after parsing (explicit `undefined`, not `delete`, so the field stays traceable in the type)
  // so schema freshness checks do not retain unused token arrays.
  result.ast.tokens = undefined
  return result
}

export function isNode(value: unknown): value is UnknownNode {
  return (
    typeof value === 'object' && value !== null && typeof (value as UnknownNode).type === 'string'
  )
}

export function walk(node: UnknownNode | undefined, visit: (node: UnknownNode) => void): void {
  if (!node) return
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) walk(child, visit)
    } else if (isNode(value)) {
      walk(value, visit)
    }
  }
}
