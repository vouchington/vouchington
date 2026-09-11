import ts from 'typescript'

import { getCallExpressionName, unwrapExpression, walkAst } from './finite-enum-ripple-ast.mts'

export type AdminSurfacePredicate = (content: string, file: string) => boolean

export function callsRequireAdmin(content: string, file: string): boolean {
  return containsCall(parse(content, file), 'requireAdmin')
}

export function rendersPageWithAside(content: string, file: string): boolean {
  let found = false
  walkAst(parse(content, file), node => {
    if (found) return
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      found = jsxTagName(node.tagName) === 'PageWithAside'
    }
  })
  return found
}

export function rejectsNonReferralProgramTopics(content: string, file: string): boolean {
  let found = false
  walkAst(parse(content, file), node => {
    if (found || !ts.isBinaryExpression(node)) return
    if (node.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return
    const left = unwrapExpression(node.left)
    const right = unwrapExpression(node.right)
    found =
      (isTopicTypeAccess(left) && isReferralProgramLiteral(right)) ||
      (isTopicTypeAccess(right) && isReferralProgramLiteral(left))
  })
  return found
}

export function factoryReturnsPageThatCalls(
  factoryName: string,
  pageName: string,
  callName: string,
  firstArgumentName?: string,
): AdminSurfacePredicate {
  return (content, file) => {
    const factory = findFunction(parse(content, file), factoryName)
    if (!factory?.body) return false
    const page = findNestedFunction(factory.body, pageName)
    return Boolean(
      page?.body &&
      containsCall(page.body, callName, firstArgumentName) &&
      functionReturnsDefault(factory.body, pageName),
    )
  }
}

function parse(content: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function containsCall(root: ts.Node, name: string, firstArgumentName?: string): boolean {
  let found = false
  walkAst(root, node => {
    if (found || !ts.isCallExpression(node)) return
    found =
      getCallExpressionName(node.expression) === name &&
      firstArgumentMatches(node, firstArgumentName)
  })
  return found
}

function firstArgumentMatches(call: ts.CallExpression, name: string | undefined): boolean {
  if (!name) return true
  const first = call.arguments[0] && unwrapExpression(call.arguments[0])
  return Boolean(first && ts.isIdentifier(first) && first.text === name)
}

function functionReturnsDefault(root: ts.Node, pageName: string): boolean {
  let found = false
  walkAst(root, node => {
    if (found || !ts.isReturnStatement(node) || !node.expression) return
    const returned = unwrapExpression(node.expression)
    if (!ts.isObjectLiteralExpression(returned)) return
    found = returned.properties.some(property => defaultPropertyMatches(property, pageName))
  })
  return found
}

function defaultPropertyMatches(property: ts.ObjectLiteralElementLike, pageName: string): boolean {
  if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
    return false
  if (ts.isShorthandPropertyAssignment(property)) return false
  if (!ts.isIdentifier(property.name) || property.name.text !== 'default') return false
  const initializer = unwrapExpression(property.initializer)
  return ts.isIdentifier(initializer) && initializer.text === pageName
}

function findFunction(root: ts.Node, name: string): ts.FunctionDeclaration | undefined {
  let found: ts.FunctionDeclaration | undefined
  walkAst(root, node => {
    if (found || !ts.isFunctionDeclaration(node)) return
    if (node.name?.text === name) found = node
  })
  return found
}

function findNestedFunction(root: ts.Node, name: string): ts.FunctionDeclaration | undefined {
  let found: ts.FunctionDeclaration | undefined
  for (const statement of ts.isBlock(root) ? root.statements : []) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) found = statement
  }
  return found
}

function jsxTagName(name: ts.JsxTagNameExpression): string | undefined {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isPropertyAccessExpression(name)) return name.name.text
  return undefined
}

function isTopicTypeAccess(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'topic_type'
}

function isReferralProgramLiteral(node: ts.Expression): boolean {
  return ts.isStringLiteral(node) && node.text === 'referral_program'
}
