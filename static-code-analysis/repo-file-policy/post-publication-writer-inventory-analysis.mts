import ts from 'typescript'
import {
  CAPTURE_IMPORT_MODULE_SPECIFIERS,
  CAPTURE_SYMBOLS,
  ELIGIBILITY_TABLES,
} from './post-publication-writer-inventory-constants.mts'
const DML = /\b(?:INSERT\s+INTO|UPDATE(?:\s+ONLY)?|DELETE\s+FROM)\b/i
const DML_PREFIX = /\b(?:INSERT\s+INTO|UPDATE(?:\s+ONLY)?|DELETE\s+FROM)\s*$/i

export type PostPublicationWriterSourceAnalysis = {
  readonly callsApprovedCaptureHelper: boolean
  readonly optsOutOfPublicationCapture: boolean
  readonly writesConfigEntityTable: boolean
  readonly writesGeneratedRelationTable: boolean
  readonly writesEligibilityTable: boolean
}

export function analyzePostPublicationWriterSource(
  source: string,
  path: string,
): PostPublicationWriterSourceAnalysis {
  const captureBindings = new Set<string>()
  const invokedIdentifiers = new Set<string>()
  const relationTableBindings = new Set<string>()
  let optsOutOfPublicationCapture = false
  let hasConfigEntityTable = false
  let hasDmlPrefix = false
  let buildsRelationInsert = false
  let appendsRelationTable = false
  let writesEligibilityTable = false
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) collectCaptureBindings(node, captureBindings)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      invokedIdentifiers.add(node.expression.text)
      buildsRelationInsert ||= node.expression.text === 'buildInsertQuery'
      hasConfigEntityTable ||= isConfigEntityTableAssertion(node)
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'capturePublication' &&
      node.initializer.kind === ts.SyntaxKind.FalseKeyword
    )
      optsOutOfPublicationCapture = true
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isEntityRelationElectionTableIdentifier(node.initializer)
    )
      relationTableBindings.add(node.name.text)
    if (ts.isCallExpression(node) && isRelationTableAppend(node, relationTableBindings))
      appendsRelationTable = true
    if (isSqlTextNode(node)) {
      const text = sqlText(node)
      if (!ts.isStringLiteral(node)) hasDmlPrefix ||= DML_PREFIX.test(text)
      if (DML.test(text)) {
        const table = writtenTableName(text)
        writesEligibilityTable ||=
          ELIGIBILITY_TABLES.has(table ?? '') ||
          (ts.isTemplateExpression(node) && dynamicEligibilityTable(node))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return {
    callsApprovedCaptureHelper: [...captureBindings].some(binding =>
      invokedIdentifiers.has(binding),
    ),
    optsOutOfPublicationCapture,
    writesConfigEntityTable: hasConfigEntityTable && hasDmlPrefix,
    writesGeneratedRelationTable: buildsRelationInsert || (appendsRelationTable && hasDmlPrefix),
    writesEligibilityTable,
  }
}

function collectCaptureBindings(node: ts.ImportDeclaration, bindings: Set<string>): void {
  if (
    !ts.isStringLiteral(node.moduleSpecifier) ||
    !CAPTURE_IMPORT_MODULE_SPECIFIERS.has(node.moduleSpecifier.text)
  )
    return
  const namedBindings = node.importClause?.namedBindings
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return
  for (const binding of namedBindings.elements) {
    const importedName = binding.propertyName?.text ?? binding.name.text
    if (CAPTURE_SYMBOLS.has(importedName)) bindings.add(binding.name.text)
  }
}
function isConfigEntityTableAssertion(node: ts.CallExpression): boolean {
  return (
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'assertWhitelistedSqlIdentifier' &&
    isConfigEntityTable(node.arguments[0])
  )
}
function isRelationTableAppend(node: ts.CallExpression, bindings: Set<string>): boolean {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'append')
    return false
  const argument = node.arguments[0]
  return isRelationTableName(argument) || (ts.isIdentifier(argument) && bindings.has(argument.text))
}
function isEntityRelationElectionTableIdentifier(initializer: ts.Expression | undefined): boolean {
  return Boolean(
    initializer &&
    ts.isCallExpression(initializer) &&
    ts.isIdentifier(initializer.expression) &&
    initializer.expression.text === 'assertWhitelistedSqlIdentifier' &&
    initializer.arguments.some(
      argument => ts.isIdentifier(argument) && argument.text === 'entityRelationElectionTables',
    ),
  )
}
function isConfigEntityTable(node: ts.Expression | undefined): boolean {
  return Boolean(
    node &&
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'entityTable' &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'config',
  )
}
function isRelationTableName(node: ts.Expression | undefined): boolean {
  return Boolean(
    node &&
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'table_name' &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'relation',
  )
}
function isSqlTextNode(
  node: ts.Node,
): node is ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression | ts.StringLiteral {
  return (
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    ts.isStringLiteral(node)
  )
}
function sqlText(
  node: ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression | ts.StringLiteral,
): string {
  if (ts.isStringLiteral(node)) return node.text
  return ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join('')
}
function writtenTableName(text: string): string | undefined {
  return /\b(?:INSERT\s+INTO|UPDATE(?:\s+ONLY)?|DELETE\s+FROM)\s+(?:(?:"?[\w$]+"?\.)?"?)([\w$]+)"?/i
    .exec(text)?.[1]
    ?.toLowerCase()
}
function dynamicEligibilityTable(node: ts.TemplateExpression): boolean {
  if (
    !/\b(?:INSERT\s+INTO|UPDATE(?:\s+ONLY)?|DELETE\s+FROM)\s+(?:(?:"?[\w$]+"?\.)?)$/i.test(
      node.head.text,
    )
  )
    return false
  const expression = node.templateSpans[0]?.expression
  return Boolean(
    expression && ts.isStringLiteral(expression) && ELIGIBILITY_TABLES.has(expression.text),
  )
}
