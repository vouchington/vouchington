/**
 * Minimal SPDX license-expression parser/evaluator.
 *
 * `pnpm licenses list --json` groups packages by the raw license string from
 * their `package.json` `license` field, which may be a compound SPDX
 * expression such as `(MIT OR Apache-2.0)` or `MIT AND ISC`. `OR` means the
 * consumer may pick either branch (the expression is "clean" if any branch
 * is clean); `AND` means both licenses apply simultaneously (the expression
 * is only "clean" if every branch is clean). A trailing `+` on a license id
 * ("this version or later", e.g. `GPL-2.0+`) and a `WITH <exception>`
 * clause are both kept on the atom string; policy.mts matches by prefix, so
 * the `+`/`WITH` suffix does not need stripping to be caught correctly.
 */

export type SpdxNode =
  | { type: 'AND'; children: SpdxNode[] }
  | { type: 'OR'; children: SpdxNode[] }
  | { type: 'ATOM'; id: string }

function tokenize(expression: string): string[] {
  return expression
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 0)
}

class ExpressionParser {
  private readonly tokens: string[]
  private position = 0

  constructor(tokens: string[]) {
    this.tokens = tokens
  }

  parse(): SpdxNode {
    const node = this.parseOr()
    if (this.position !== this.tokens.length) {
      throw new Error(`Unexpected trailing token: ${this.tokens[this.position]}`)
    }
    return node
  }

  private parseOr(): SpdxNode {
    const children = [this.parseAnd()]
    while (this.tokens[this.position] === 'OR') {
      this.position += 1
      children.push(this.parseAnd())
    }
    return children.length === 1 ? children[0]! : { type: 'OR', children }
  }

  private parseAnd(): SpdxNode {
    const children = [this.parseAtom()]
    while (this.tokens[this.position] === 'AND') {
      this.position += 1
      children.push(this.parseAtom())
    }
    return children.length === 1 ? children[0]! : { type: 'AND', children }
  }

  private parseAtom(): SpdxNode {
    const token = this.tokens[this.position]
    if (token === undefined) throw new Error('Unexpected end of license expression')
    if (token === '(') {
      this.position += 1
      const node = this.parseOr()
      if (this.tokens[this.position] !== ')') throw new Error('Unbalanced parentheses')
      this.position += 1
      return node
    }
    if (token === ')' || token === 'AND' || token === 'OR') {
      throw new Error(`Unexpected token: ${token}`)
    }
    this.position += 1
    return { type: 'ATOM', id: token }
  }
}

/**
 * Parses an SPDX-shaped license expression into a tree. Throws on malformed
 * input (unbalanced parens, dangling operators); callers must catch and fall
 * back to treating the raw string as a single opaque atom rather than
 * crashing the check.
 */
export function parseSpdxExpression(expression: string): SpdxNode {
  const tokens = tokenize(expression)
  if (tokens.length === 0) return { type: 'ATOM', id: '' }
  return new ExpressionParser(tokens).parse()
}

/**
 * Evaluates whether a parsed expression is "clean" under `isAtomOk`: an OR
 * node is clean if any child is clean (the consumer can choose the clean
 * license); an AND node is clean only if every child is clean (every listed
 * license applies at once, so one bad license taints the whole grouping).
 */
export function evaluateSpdxExpression(
  node: SpdxNode,
  isAtomOk: (atomId: string) => boolean,
): boolean {
  if (node.type === 'ATOM') return isAtomOk(node.id)
  if (node.type === 'OR')
    return node.children.some(child => evaluateSpdxExpression(child, isAtomOk))
  return node.children.every(child => evaluateSpdxExpression(child, isAtomOk))
}

/** Flattens every atom id out of a parsed expression tree, for diagnostics. */
export function collectSpdxAtoms(node: SpdxNode): string[] {
  if (node.type === 'ATOM') return [node.id]
  return node.children.flatMap(collectSpdxAtoms)
}
