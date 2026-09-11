import type { SharedContext } from 'vouchington-tooling/shared-context'
import { isNode, parseSource, propertyName, walk } from '../targeted-guardrails/ast-utils.mts'
import {
  appendReceiverName,
  isAppendCall,
  isTerminalSqlCall,
  staticSqlTemplateText,
  terminalSqlExecutorBindings,
} from './post-publication-reader-inventory-source-helpers.mts'

type Node = import('../targeted-guardrails/ast-utils.mts').UnknownNode

const PUBLIC_READER_SCOPES = [
  'backend/api/',
  'backend/md/',
  'backend/services/comments/',
  'backend/services/communities/list-items/',
  'backend/services/communities/publications/',
  'backend/services/data-points/',
  'backend/services/my/landing-pages/',
  'backend/services/feeds/',
  'backend/services/posts/search/',
  'backend/services/posts/metrics.mts',
  'backend/services/posts/metrics-batch.mts',
  'backend/services/posts/public-ids.mts',
  'backend/services/posts/tools/',
  'backend/services/platform-stats/',
  'backend/services/stories/get-post-stories.mts',
  'backend/services/prioritized-referral-links/',
  'backend/services/rss-feed-items/',
  'backend/services/rss-xml/',
  'backend/services/search/',
  'backend/services/sitemaps/',
  'backend/services/trending-posts/',
  'backend/services/topics/',
  'backend/services/users/metrics-batch-sql.mts',
]

export function discoverPublicPostReaders(ctx: SharedContext): string[] {
  const readers: string[] = []
  for (const path of ctx.trackedFiles) {
    if (
      !path.endsWith('.mts') ||
      path.includes('/__tests__/') ||
      path.includes('.test.') ||
      !PUBLIC_READER_SCOPES.some(prefix => path.startsWith(prefix))
    ) {
      continue
    }
    const content = ctx.readTrackedFile?.(path)
    if (!content || !content.includes('sql')) continue
    const referencesPostRows =
      /\b(?:FROM|JOIN)\s+(?:view_)?posts\b/i.test(content) ||
      /\bposts?\.(?:id|root_id|deleted_at|approved_at|archived_at|privacy|broadcast|post_type|community_id)\b/.test(
        content,
      ) ||
      content.includes('post__stories')
    const buildsReaderSql =
      /\bSELECT\b/i.test(content) ||
      /(?:query-builder|search-filters|eligible-posts-cte)/.test(path)
    if (referencesPostRows && buildsReaderSql) readers.push(path)
  }
  return readers
}

/** Extracts static SQL template quasis and reassembles local SQLStatement append chains. */
export function extractStaticSqlTemplateQuasis(content: string): string[] {
  const ast = parseSource(content).ast
  const terminalExecutors = terminalSqlExecutorBindings(ast)
  const statements = new Map<string, { text: string; offset: number }>()
  const consumedStatements = new Set<string>()
  const directStatements: string[] = []
  walk(ast, (node: Node) => {
    if (node.type !== 'VariableDeclarator') return
    const binding = propertyName(isNode(node.id) ? node.id : undefined)
    const initializer = isNode(node.init) ? node.init : undefined
    const statementText = staticSqlTemplateText(initializer)
    if (binding && statementText)
      statements.set(binding, { text: statementText, offset: node.range?.[0] ?? 0 })
  })
  walk(ast, (node: Node) => {
    if (node.type === 'ExportNamedDeclaration' && isNode(node.declaration)) {
      markExportedStatementBindings(node.declaration, consumedStatements)
    }
    if (node.type === 'ReturnStatement' && isNode(node.argument)) {
      const binding = propertyName(node.argument)
      if (binding) consumedStatements.add(binding)
      const text = staticSqlTemplateText(node.argument)
      if (text) directStatements.push(text)
      return
    }
    if (node.type !== 'CallExpression' || !Array.isArray(node.arguments)) return
    const terminal = isTerminalSqlCall(node, terminalExecutors)
    for (const argument of node.arguments) {
      if (!isNode(argument)) continue
      const binding = propertyName(argument)
      if (binding && terminal) consumedStatements.add(binding)
      const text = staticSqlTemplateText(argument)
      if (text && terminal) directStatements.push(text)
    }
  })
  walk(ast, (node: Node) => {
    if (!isAppendCall(node) || !Array.isArray(node.arguments)) return
    const receiver = appendReceiverName(node)
    const argument = node.arguments.find(isNode)
    const appended = argument ? staticSqlTemplateText(argument) : null
    const statement = receiver ? statements.get(receiver) : undefined
    if (statement && appended && (node.range?.[0] ?? 0) > statement.offset) {
      statement.text += appended
    }
  })
  return [
    ...directStatements,
    ...[...statements.entries()].flatMap(([binding, statement]) =>
      consumedStatements.has(binding) ? [statement.text] : [],
    ),
  ]
}

function markExportedStatementBindings(declaration: Node, consumed: Set<string>): void {
  if (declaration.type !== 'VariableDeclaration' || !Array.isArray(declaration.declarations)) return
  for (const declarator of declaration.declarations) {
    if (!isNode(declarator) || !isNode(declarator.id)) continue
    const binding = propertyName(declarator.id)
    if (binding) consumed.add(binding)
  }
}

export {
  sourceImportsAndComposesAny,
  sourceImportsAndUsesBoundaryAny,
} from './post-publication-reader-inventory-composition.mts'
export { sourceFiltersWithPublicBoundary } from './post-publication-reader-inventory-public-boundary.mts'
