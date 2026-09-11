import ts from 'typescript'
import { createSourceFile } from './ast.mts'
import { type BindingSkip, scanFunctionBindings } from './binding.mts'
import { computeKey } from './key-scheme.mts'
import { scanForTargets, type SkipNote } from './targets.mts'

export interface CatalogEntry {
  fullKey: string
  normalizedText: string
}

export interface RewriteReport {
  filePath: string
  extractedCount: number
  skippedTargets: SkipNote[]
  skippedFunctions: BindingSkip[]
}

export interface RewriteResult {
  filePath: string
  changed: boolean
  newText: string
  entries: CatalogEntry[]
  report: RewriteReport
}

interface Edit {
  start: number
  end: number
  replacement: string
}

const CLIENT_IMPORT = {
  moduleSpecifier: '@/lib/i18n/use-translations',
  importName: 'useTranslations',
} as const
const SERVER_IMPORT = {
  moduleSpecifier: '@/lib/i18n/get-translations',
  importName: 'getTranslations',
} as const

/** Runs the full extraction pipeline over one file's source text: scans eligible functions,
 * scans each for extraction targets, computes catalog keys, and splices the rewritten source. */
export function rewriteFile(filePath: string, sourceText: string): RewriteResult {
  const sourceFile = createSourceFile(sourceText, filePath)
  const { eligible, skipped: skippedFunctions } = scanFunctionBindings(sourceFile)

  const edits: Edit[] = []
  const entries: CatalogEntry[] = []
  const skippedTargets: SkipNote[] = []
  let needsClientImport = false
  let needsServerImport = false

  for (const binding of eligible) {
    const { targets, skipped } = scanForTargets(binding.candidate.body, sourceFile)
    skippedTargets.push(...skipped)
    if (targets.length === 0) continue

    for (const target of targets) {
      const { fullKey, normalizedText } = computeKey(filePath, target.rawText)
      entries.push({ fullKey, normalizedText })
      const replacement =
        target.kind === 'toast-success' || target.kind === 'toast-error-fallback'
          ? `t('${fullKey}')`
          : `{t('${fullKey}')}`
      edits.push({ start: target.start, end: target.end, replacement })
    }

    if (!binding.existing) {
      if (binding.mode === 'client') needsClientImport = true
      else needsServerImport = true
      edits.push(
        buildBindingInjectionEdit(sourceFile, sourceText, binding.candidate.body, binding.mode),
      )
    }
  }

  if (needsClientImport && !hasNamedImport(sourceFile, CLIENT_IMPORT)) {
    edits.push(buildImportEdit(sourceFile, CLIENT_IMPORT))
  }
  if (needsServerImport && !hasNamedImport(sourceFile, SERVER_IMPORT)) {
    edits.push(buildImportEdit(sourceFile, SERVER_IMPORT))
  }

  const newText = edits.length > 0 ? applyEdits(sourceText, edits) : sourceText
  return {
    filePath,
    changed: newText !== sourceText,
    newText,
    entries,
    report: { filePath, extractedCount: entries.length, skippedTargets, skippedFunctions },
  }
}

function buildBindingInjectionEdit(
  sourceFile: ts.SourceFile,
  sourceText: string,
  body: ts.Block,
  mode: 'client' | 'server',
): Edit {
  const firstStatement = body.statements[0]
  const insertAt = firstStatement
    ? firstStatement.getStart(sourceFile)
    : body.getStart(sourceFile) + 1
  const indent = leadingIndentBefore(sourceText, insertAt)
  const bindingSource =
    mode === 'client' ? 'const t = useTranslations()' : 'const t = await getTranslations()'
  return { start: insertAt, end: insertAt, replacement: `${bindingSource}\n${indent}` }
}

/** The whitespace run immediately preceding `pos` on its own line — used so an injected statement
 * lines up with the indentation of the statement it's inserted before. */
function leadingIndentBefore(sourceText: string, pos: number): string {
  let i = pos
  while (i > 0 && (sourceText[i - 1] === ' ' || sourceText[i - 1] === '\t')) i--
  return sourceText.slice(i, pos)
}

function hasNamedImport(
  sourceFile: ts.SourceFile,
  spec: { moduleSpecifier: string; importName: string },
): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.moduleSpecifier.text !== spec.moduleSpecifier) continue
    const namedBindings = statement.importClause?.namedBindings
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      if (namedBindings.elements.some(el => el.name.text === spec.importName)) return true
    }
  }
  return false
}

function buildImportEdit(
  sourceFile: ts.SourceFile,
  spec: { moduleSpecifier: string; importName: string },
): Edit {
  const importLine = `import { ${spec.importName} } from '${spec.moduleSpecifier}'`
  const lastImport = [...sourceFile.statements].toReversed().find(ts.isImportDeclaration)
  if (lastImport) {
    return { start: lastImport.getEnd(), end: lastImport.getEnd(), replacement: `\n${importLine}` }
  }
  const first = sourceFile.statements[0]
  if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)) {
    return { start: first.getEnd(), end: first.getEnd(), replacement: `\n\n${importLine}` }
  }
  return { start: 0, end: 0, replacement: `${importLine}\n\n` }
}

/** Applies edits by descending start position so earlier (lower-position) edits' offsets — all
 * computed from the original, unmodified AST — stay valid throughout the splice. */
function applyEdits(sourceText: string, edits: Edit[]): string {
  const sorted = [...edits].toSorted((a, b) => b.start - a.start || b.end - a.end)
  let result = sourceText
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
  }
  return result
}
