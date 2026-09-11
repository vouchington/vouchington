import ts from 'typescript'

import { getStringLiteralValue, unwrapExpression, walkAst } from './finite-enum-ripple-ast.mts'

export interface RedirectDestinationExtraction {
  bodyFound: boolean
  destinations: string[]
  sawDestinationProperty: boolean
  sawOwnerPrivatePaths: boolean
  sawOwnerPrivatePathsTuple: boolean
}

export function extractRedirectDestinations(
  content: string,
  file: string,
): RedirectDestinationExtraction {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  )
  const body = findRedirectsBody(sourceFile)
  if (!body) {
    return {
      bodyFound: false,
      destinations: [],
      sawDestinationProperty: false,
      sawOwnerPrivatePaths: false,
      sawOwnerPrivatePathsTuple: false,
    }
  }
  return { bodyFound: true, ...extractDestinations(body) }
}

function extractDestinations(
  body: ts.Block | ts.Expression,
): Omit<RedirectDestinationExtraction, 'bodyFound'> {
  const destinations = new Set<string>()
  let sawDestinationProperty = false
  let sawOwnerPrivatePaths = false
  let sawOwnerPrivatePathsTuple = false

  function inspectRedirectObject(node: ts.ObjectLiteralExpression): void {
    for (const prop of node.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'destination'
      ) {
        sawDestinationProperty = true
      }
    }
  }

  function inspectOwnerPrivatePathsArray(node: ts.ArrayLiteralExpression): void {
    for (const element of node.elements) {
      if (!ts.isArrayLiteralExpression(element) || element.elements.length < 2) continue
      const second = getStringLiteralValue(element.elements[1])
      if (second === undefined) continue
      sawOwnerPrivatePathsTuple = true
      destinations.add(`/${second}`)
    }
  }

  walkAst(body, node => {
    if (ts.isObjectLiteralExpression(node)) {
      inspectRedirectObject(node)
    } else if (ts.isIdentifier(node) && node.text === 'ownerPrivatePaths') {
      sawOwnerPrivatePaths = true
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === 'ownerPrivatePaths') {
        const init = node.initializer && unwrapExpression(node.initializer)
        if (init && ts.isArrayLiteralExpression(init)) inspectOwnerPrivatePathsArray(init)
      }
    }
  })
  return {
    destinations: [...destinations],
    sawDestinationProperty,
    sawOwnerPrivatePaths,
    sawOwnerPrivatePathsTuple,
  }
}

function findRedirectsBody(sourceFile: ts.SourceFile): ts.Block | ts.Expression | undefined {
  let body: ts.Block | ts.Expression | undefined

  function visit(node: ts.Node): void {
    if (body) return
    if (
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'redirects'
    ) {
      body = node.body
      return
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'redirects'
    ) {
      const init = unwrapExpression(node.initializer)
      if (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) body = init.body
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return body
}
