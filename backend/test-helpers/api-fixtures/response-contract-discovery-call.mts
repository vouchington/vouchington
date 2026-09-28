import type { CallExpression, Expression, Node, Statement } from 'typescript'

import {
  isTypescriptBlock,
  isTypescriptCallExpression,
  isTypescriptExpressionStatement,
  isTypescriptIdentifier,
  isTypescriptNumericLiteral,
  isTypescriptObjectLiteralExpression,
  isTypescriptPropertyAccessExpression,
  isTypescriptSpreadAssignment,
  isTypescriptStatement,
} from './program-paths.mts'

/** Label for a response emission implicit discovery would register, or `undefined` when it would not. */
export function discoveryCallLabel(call: CallExpression): string | undefined {
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

function isStreamJsonPipeline(call: CallExpression): boolean {
  if (!isContextMethod(call.expression, 'pipeline')) return false
  const pipelineBody = call.arguments[0]
  return (
    !!pipelineBody &&
    isTypescriptCallExpression(pipelineBody) &&
    isTypescriptIdentifier(pipelineBody.expression) &&
    pipelineBody.expression.text === 'streamJsonObject' &&
    !!pipelineBody.arguments[0]
  )
}

function isInErrorBranch(call: CallExpression): boolean {
  let statement: Node = call
  while (!isTypescriptStatement(statement)) statement = statement.parent
  const asStatement = statement as Statement
  if (precededByStatus(asStatement, isBareErrorStatusStatement)) return true
  return isErrorObjectJson(call) && precededByStatus(asStatement, isDynamicStatusStatement)
}

function precededByStatus(
  statement: Statement,
  matches: (statement: Statement) => boolean,
): boolean {
  const block = statement.parent
  if (!isTypescriptBlock(block)) return false
  const index = block.statements.indexOf(statement)
  if (block.statements.slice(0, index).some(matches)) return true
  const enclosing = block.parent
  return isTypescriptStatement(enclosing) ? precededByStatus(enclosing, matches) : false
}

function isErrorObjectJson(call: CallExpression): boolean {
  if (!isContextMethod(call.expression, 'json')) return false
  const body = call.arguments[0]
  if (!body || !isTypescriptObjectLiteralExpression(body)) return false
  return body.properties.some(property => {
    if (isTypescriptSpreadAssignment(property) || !isTypescriptIdentifier(property.name))
      return false
    return property.name.text === 'error'
  })
}

function isDynamicStatusStatement(statement: Statement): boolean {
  const statusArgument = statusArgumentOf(statement)
  return statusArgument !== undefined && !isTypescriptNumericLiteral(statusArgument)
}

function isBareErrorStatusStatement(statement: Statement): boolean {
  const statusArgument = statusArgumentOf(statement)
  return (
    !!statusArgument &&
    isTypescriptNumericLiteral(statusArgument) &&
    Number(statusArgument.text) >= 400
  )
}

function statusArgumentOf(statement: Statement): Expression | undefined {
  if (
    !isTypescriptExpressionStatement(statement) ||
    !isTypescriptCallExpression(statement.expression)
  ) {
    return undefined
  }
  if (!isContextMethod(statement.expression.expression, 'setStatus')) return undefined
  return statement.expression.arguments[0]
}

function isContextMethod(expression: Expression, method: string): boolean {
  return (
    isTypescriptPropertyAccessExpression(expression) &&
    isTypescriptIdentifier(expression.expression) &&
    expression.expression.text === 'ctx' &&
    expression.name.text === method
  )
}

function isContextResponseEmptyCall(expression: Expression): boolean {
  return (
    isTypescriptPropertyAccessExpression(expression) &&
    expression.name.text === 'empty' &&
    isContextMethod(expression.expression, 'response')
  )
}

function isContextResponseBufferCall(expression: Expression): boolean {
  return (
    isTypescriptPropertyAccessExpression(expression) &&
    expression.name.text === 'buffer' &&
    isContextMethod(expression.expression, 'response')
  )
}

function isXmlResponseCall(call: CallExpression): boolean {
  return (
    isTypescriptPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'xml' &&
    isContextMethod(call.expression.expression, 'response')
  )
}

function containsResponseMarker(node: Node): boolean {
  let found = false
  visit(node, child => {
    if (!isTypescriptCallExpression(child) || !isTypescriptIdentifier(child.expression)) return
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

function visit(node: Node, callback: (node: Node) => void): void {
  callback(node)
  node.forEachChild(child => visit(child, callback))
}
