import ts from 'typescript'

/**
 * Returns the stable branch conditions required to reach a node.
 *
 * Only const-identifier predicates and their negation are trusted. The right side of `&&` adds
 * the left predicate. Other conditional constructs fail closed instead of attempting a CFG.
 */
export function guardLineage(node: ts.Node, checker: ts.TypeChecker): string | undefined {
  const owner = owningFunction(node)
  if (!owner) return undefined

  const clauses: string[] = []
  let parent: ts.Node | undefined = node.parent
  while (parent && parent !== owner) {
    if (isLoopOrSwitch(parent)) return undefined
    if (ts.isTryStatement(parent)) {
      if (
        (parent.catchClause && isWithin(node, parent.catchClause)) ||
        (parent.finallyBlock && isWithin(node, parent.finallyBlock))
      ) {
        return undefined
      }
      if (isWithin(node, parent.tryBlock) && !catchAlwaysThrows(parent)) {
        const source = parent.getSourceFile()
        clauses.push(`try:${source.fileName.replaceAll('\\', '/')}:${parent.getStart(source)}`)
      }
    }

    if (ts.isIfStatement(parent)) {
      if (isWithin(node, parent.thenStatement)) {
        const condition = conditionLineage(parent.expression, true, checker)
        if (!condition) return undefined
        clauses.push(...condition)
      } else if (parent.elseStatement && isWithin(node, parent.elseStatement)) {
        const condition = conditionLineage(parent.expression, false, checker)
        if (!condition) return undefined
        clauses.push(...condition)
      }
    }

    if (ts.isConditionalExpression(parent)) {
      if (isWithin(node, parent.whenTrue) || isWithin(node, parent.whenFalse)) return undefined
    }

    if (ts.isBinaryExpression(parent) && isWithin(node, parent.right)) {
      if (parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const condition = conditionLineage(parent.left, true, checker)
        if (!condition) return undefined
        clauses.push(...condition)
      } else if (
        parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return undefined
      }
    }

    parent = parent.parent
  }

  if (parent !== owner) return undefined
  return JSON.stringify(clauses.reverse())
}

/** True when a trusted validator call necessarily precedes this read on the same guarded path. */
export function validatorDominatesRead(
  validators: readonly ts.Node[],
  read: ts.Node,
  checker: ts.TypeChecker,
): boolean {
  const readOwner = owningFunction(read)
  if (!readOwner) return false
  const readLineage = guardLineage(read, checker)
  if (readLineage === undefined) return false
  const readSource = read.getSourceFile()
  const readPosition = read.getStart(readSource)

  return validators.some(validator => {
    if (
      validator.getSourceFile() !== readSource ||
      owningFunction(validator) !== readOwner ||
      validator.getStart(readSource) >= readPosition
    ) {
      return false
    }
    const validatorLineage = guardLineage(validator, checker)
    return (
      validatorLineage !== undefined &&
      (validatorLineage === '[]' || validatorLineage === readLineage)
    )
  })
}

function conditionLineage(
  expression: ts.Expression,
  truth: boolean,
  checker: ts.TypeChecker,
): string[] | undefined {
  if (ts.isParenthesizedExpression(expression)) {
    return conditionLineage(expression.expression, truth, checker)
  }
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return conditionLineage(expression.operand, !truth, checker)
  }
  if (
    truth &&
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    const left = conditionLineage(expression.left, true, checker)
    const right = conditionLineage(expression.right, true, checker)
    return left && right ? [...left, ...right] : undefined
  }
  if (!ts.isIdentifier(expression)) return undefined

  const symbol = checker.getSymbolAtLocation(expression)
  const isConst = symbol?.declarations?.some(
    declaration =>
      ts.isVariableDeclaration(declaration) &&
      ts.isVariableDeclarationList(declaration.parent) &&
      (declaration.parent.flags & ts.NodeFlags.Const) !== 0,
  )
  if (!symbol || !isConst) return undefined
  const declaration = symbol.declarations?.find(ts.isVariableDeclaration)
  if (!declaration) return undefined
  const source = declaration.getSourceFile()
  const fileName = source.fileName.replaceAll('\\', '/')
  return [`${fileName}:${declaration.getStart(source)}=${truth ? 'true' : 'false'}`]
}

function owningFunction(node: ts.Node): ts.Node | undefined {
  let current: ts.Node | undefined = node
  while (current && !ts.isFunctionLike(current)) current = current.parent
  return current
}

function isWithin(node: ts.Node, ancestor: ts.Node): boolean {
  let current: ts.Node | undefined = node
  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}

function isLoopOrSwitch(node: ts.Node): boolean {
  return (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node)
  )
}

function catchAlwaysThrows(statement: ts.TryStatement): boolean {
  if (!statement.catchClause || statement.finallyBlock) return false
  const block = statement.catchClause.block
  const last = block.statements.at(-1)
  if (!last || !ts.isThrowStatement(last)) return false
  let canExitEarly = false
  const visit = (node: ts.Node): void => {
    if (canExitEarly || (node !== block && ts.isFunctionLike(node))) return
    if (ts.isReturnStatement(node) || ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
      canExitEarly = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(block)
  return !canExitEarly
}
