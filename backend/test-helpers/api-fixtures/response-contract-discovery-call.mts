import ts from 'typescript'

/** Label for a response emission implicit discovery would register, or `undefined` when it would not. */
export function discoveryCallLabel(call: ts.CallExpression): string | undefined {
  if (isContextMethod(call.expression, 'json')) {
    if (!call.arguments[0] || isInErrorBranch(call)) return undefined
    return 'ctx.json()'
  }
  if (isStreamJsonPipeline(call)) {
    return isInErrorBranch(call) ? undefined : 'ctx.pipeline()'
  }
  if (isXmlResponseCall(call)) return call.arguments[0] ? 'ctx.response.xml()' : undefined
  if (isContextResponseBufferCall(call.expression)) return 'ctx.response.buffer()'
  if (isContextResponseEmptyCall(call.expression)) return 'ctx.response.empty()'
  if (isContextMethod(call.expression, 'pipeline') && !containsResponseMarker(call)) {
    return 'ctx.pipeline()'
  }
  return undefined
}

function isStreamJsonPipeline(call: ts.CallExpression): boolean {
  if (!isContextMethod(call.expression, 'pipeline')) return false
  const pipelineBody = call.arguments[0]
  return (
    !!pipelineBody &&
    ts.isCallExpression(pipelineBody) &&
    ts.isIdentifier(pipelineBody.expression) &&
    pipelineBody.expression.text === 'streamJsonObject' &&
    !!pipelineBody.arguments[0]
  )
}

function isInErrorBranch(call: ts.CallExpression): boolean {
  let statement: ts.Node = call
  while (!ts.isStatement(statement)) statement = statement.parent
  const asStatement = statement as ts.Statement
  if (precededByStatus(asStatement, isBareErrorStatusStatement)) return true
  return isErrorObjectJson(call) && precededByStatus(asStatement, isDynamicStatusStatement)
}

function precededByStatus(
  statement: ts.Statement,
  matches: (statement: ts.Statement) => boolean,
): boolean {
  const block = statement.parent
  if (!ts.isBlock(block)) return false
  const index = block.statements.indexOf(statement)
  if (block.statements.slice(0, index).some(matches)) return true
  const enclosing = block.parent
  return ts.isStatement(enclosing) ? precededByStatus(enclosing, matches) : false
}

function isErrorObjectJson(call: ts.CallExpression): boolean {
  if (!isContextMethod(call.expression, 'json')) return false
  const body = call.arguments[0]
  if (!body || !ts.isObjectLiteralExpression(body)) return false
  return body.properties.some(property => {
    if (ts.isSpreadAssignment(property) || !ts.isIdentifier(property.name)) return false
    return property.name.text === 'error'
  })
}

function isDynamicStatusStatement(statement: ts.Statement): boolean {
  const statusArgument = statusArgumentOf(statement)
  return statusArgument !== undefined && !ts.isNumericLiteral(statusArgument)
}

function isBareErrorStatusStatement(statement: ts.Statement): boolean {
  const statusArgument = statusArgumentOf(statement)
  return (
    !!statusArgument && ts.isNumericLiteral(statusArgument) && Number(statusArgument.text) >= 400
  )
}

function statusArgumentOf(statement: ts.Statement): ts.Expression | undefined {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
    return undefined
  }
  if (!isContextMethod(statement.expression.expression, 'setStatus')) return undefined
  return statement.expression.arguments[0]
}

function isContextMethod(expression: ts.Expression, method: string): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'ctx' &&
    expression.name.text === method
  )
}

function isContextResponseEmptyCall(expression: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'empty' &&
    isContextMethod(expression.expression, 'response')
  )
}

function isContextResponseBufferCall(expression: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'buffer' &&
    isContextMethod(expression.expression, 'response')
  )
}

function isXmlResponseCall(call: ts.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'xml' &&
    isContextMethod(call.expression.expression, 'response')
  )
}

function containsResponseMarker(node: ts.Node): boolean {
  let found = false
  visit(node, child => {
    if (!ts.isCallExpression(child) || !ts.isIdentifier(child.expression)) return
    if (
      child.expression.text === 'apiResponse' ||
      child.expression.text === 'apiNoContent' ||
      child.expression.text === 'apiOpenApiRawResponse'
    ) {
      found = true
    }
  })
  return found
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node)
  node.forEachChild(child => visit(child, callback))
}
