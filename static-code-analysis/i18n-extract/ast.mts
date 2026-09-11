import ts from 'typescript'

/** Creates a `SourceFile`, branching TSX vs. plain TS by file extension, parents set for lookups. */
export function createSourceFile(content: string, filePath: string): ts.SourceFile {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind)
}

/** Depth-first pre-order walk over every descendant node (including `node` itself). */
export function walkAst(node: ts.Node, onNode: (node: ts.Node) => void): void {
  onNode(node)
  ts.forEachChild(node, child => walkAst(child, onNode))
}

/** Strips parens/`as`/`satisfies`/non-null wrappers to reach the underlying expression. */
export function unwrapExpression<T extends ts.Node>(node: T): T {
  let current: ts.Node = node
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current as T
}

/** True if the source file's first statement is a top-level `'use client'` directive. */
export function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  const first = sourceFile.statements[0]
  if (!first || !ts.isExpressionStatement(first)) return false
  const expr = first.expression
  return ts.isStringLiteral(expr) && expr.text === 'use client'
}

/** Whether a name looks like a React component (`PascalCase`) or a custom hook (`use` + upper). */
export function isComponentOrHookName(name: string): boolean {
  if (/^[A-Z]/.test(name)) return true
  return /^use[A-Z]/.test(name)
}

export interface CandidateFunction {
  name: string
  isAsync: boolean
  /** The block body statements list — injection/rewrite targets are scoped to this list. */
  body: ts.Block
}

/** Finds top-level function declarations and `const X = (...) => {...}` / `function` expressions
 * whose name looks like a component or hook and which have a block body (never an implicit-return
 * arrow) — the only shapes this codemod knows how to safely inject a `t` binding into. */
export function findCandidateFunctions(sourceFile: ts.SourceFile): CandidateFunction[] {
  const candidates: CandidateFunction[] = []

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      const name = statement.name.text
      if (isComponentOrHookName(name)) {
        candidates.push({ name, isAsync: hasAsyncModifier(statement), body: statement.body })
      }
      continue
    }

    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
        const name = decl.name.text
        if (!isComponentOrHookName(name)) continue
        const init = unwrapExpression(decl.initializer)
        const fn = ts.isArrowFunction(init) || ts.isFunctionExpression(init) ? init : undefined
        if (fn && fn.body && ts.isBlock(fn.body)) {
          candidates.push({ name, isAsync: hasAsyncModifier(fn), body: fn.body })
        }
      }
      continue
    }

    if (ts.isExportAssignment(statement)) continue
  }

  return candidates
}

function hasAsyncModifier(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
): boolean {
  return node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false
}

/** True if `body` already declares `const t = ...` (from either translator API) at its top level. */
export function findExistingTranslatorBinding(body: ts.Block): ts.VariableStatement | undefined {
  for (const statement of body.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === 't') return statement
    }
  }
  return undefined
}
