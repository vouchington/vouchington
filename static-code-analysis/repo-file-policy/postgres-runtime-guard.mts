import {
  isNode,
  nodeLine,
  parseSource,
  propertyName,
  walk,
} from '../targeted-guardrails/ast-utils.mts'
import { findUuidv7CreatedAtPredicate } from './uuidv7-created-at-guard.mts'
import { executedQueryText, sqlStatementBindings } from './postgres-runtime-query-text.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode

const EXCLUDED_RUNTIME_PATHS = [
  '/__tests__/',
  '/test-helpers/',
  '.test.',
  'backend/data-stores/psql/migration-runner/',
  'backend/scripts/seeds/',
]
const DEVELOPMENT_RUNTIME_TEST_HELPERS = new Set([
  'backend/test-helpers/entities/create-test-entities.mts',
  'backend/test-helpers/entities/rss-feeds.mts',
  'backend/test-helpers/entities/topics/core.mts',
  'backend/test-helpers/entities/urls.mts',
  'backend/test-helpers/entities/users-direct.mts',
])
const QUERY_EXECUTORS = new Set(['query', 'read', 'write'])
const TRANSACTION_COMMAND_RE = /^\s*(?:\/\*[^]*?\*\/\s*)?(?:BEGIN|COMMIT|ROLLBACK)\b/i
const SQL_ANNOTATION_RE = /^\s*\/\*\s*\S[^]*?\*\//

function postgresExecutorBindings(ast: Node): Set<string> {
  const bindings = new Set<string>()
  let hasTransactionHelper = false
  walk(ast, node => {
    if (node.type !== 'ImportDeclaration' || !isNode(node.source)) return
    if (node.source.type !== 'Literal' || node.source.value !== '@data-stores/psql') return
    if (!Array.isArray(node.specifiers)) return
    for (const specifier of node.specifiers) {
      if (!isNode(specifier) || !isNode(specifier.local)) continue
      const local = propertyName(specifier.local)
      const imported = isNode(specifier.imported) ? propertyName(specifier.imported) : local
      if (local && imported && QUERY_EXECUTORS.has(imported)) bindings.add(local)
      if (imported === 'withTransactionOptions') {
        hasTransactionHelper = true
      }
    }
  })
  if (hasTransactionHelper) bindings.add('query')
  return bindings
}

function isIdentifierCall(node: Node, names: Set<string>): boolean {
  return (
    node.type === 'CallExpression' &&
    isNode(node.callee) &&
    node.callee.type === 'Identifier' &&
    names.has(propertyName(node.callee) ?? '')
  )
}

function callArguments(node: Node): Node[] {
  return Array.isArray(node.arguments) ? node.arguments.filter(isNode) : []
}

export function checkPostgresRuntimeSource(
  file: string,
  code: string,
  uuidv7Tables: Set<string>,
  parsedAst?: Node,
): string[] {
  const normalizedFile = file.replace(/^(?:\.\/)+/, '')
  if (
    !DEVELOPMENT_RUNTIME_TEST_HELPERS.has(normalizedFile) &&
    EXCLUDED_RUNTIME_PATHS.some(path => normalizedFile.includes(path))
  ) {
    return []
  }
  const errors: string[] = []
  const ast = parsedAst ?? parseSource(code).ast
  const executorBindings = postgresExecutorBindings(ast)
  const statementBindings = sqlStatementBindings(ast)

  walk(ast, node => {
    if (node.type !== 'CallExpression') return
    const args = callArguments(node)
    const text = executedQueryText(args[0], statementBindings)
    if (!isIdentifierCall(node, executorBindings) || !text) return
    if (TRANSACTION_COMMAND_RE.test(text)) return
    if (!SQL_ANNOTATION_RE.test(text)) {
      errors.push(
        `::error file=${normalizedFile},line=${nodeLine(node)}::query execution must start with a /* name */ annotation`,
      )
    }
    const table = findUuidv7CreatedAtPredicate(text, uuidv7Tables)
    if (table) {
      errors.push(
        `::error file=${normalizedFile},line=${nodeLine(node)}::filter UUIDv7 tables by id instead of created_at (${table})`,
      )
    }
  })

  return errors
}
