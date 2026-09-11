import ts from 'typescript'
import { createSourceFile, unwrapExpression } from './ast.mts'
import type { CatalogEntry } from './rewrite.mts'

export interface CatalogMergeResult {
  mergedText: string
  addedCount: number
  totalExtractedCount: number
}

/**
 * Merges freshly extracted `{fullKey, normalizedText}` entries into `en.ts`'s isolated `extracted`
 * top-level namespace. Every run fully regenerates that namespace's serialized text (existing
 * entries loaded from the current file, unioned with this run's new entries, all keys re-sorted)
 * rather than appending in place — this is what keeps two consecutive runs over unchanged source
 * byte-identical, and keeps the hand-authored `nav`/`common`/`settings` namespaces untouched.
 */
export function mergeExtractedEntries(
  enTsSourceText: string,
  newEntries: CatalogEntry[],
): CatalogMergeResult {
  const sourceFile = createSourceFile(enTsSourceText, 'en.ts')
  const enMessagesObject = findEnMessagesObjectLiteral(sourceFile)
  const extractedProperty = findTopLevelProperty(enMessagesObject, 'extracted')
  const existing =
    extractedProperty && ts.isObjectLiteralExpression(extractedProperty.initializer)
      ? flattenObjectLiteral(extractedProperty.initializer, 'extracted')
      : new Map<string, string>()

  const merged = new Map(existing)
  let added = 0
  for (const entry of newEntries) {
    const prior = merged.get(entry.fullKey)
    if (prior !== undefined && prior !== entry.normalizedText) {
      throw new Error(
        `i18n-extract: key collision for "${entry.fullKey}" — existing text ${JSON.stringify(prior)} vs new text ${JSON.stringify(entry.normalizedText)}. Two distinct source strings produced the same key; this should be astronomically unlikely and indicates a real bug.`,
      )
    }
    if (prior === undefined) added++
    merged.set(entry.fullKey, entry.normalizedText)
  }

  const nested = buildNestedObject(merged)
  const serializedValue = serializeObject(nested, 2)
  const edit = extractedProperty
    ? {
        start: extractedProperty.getStart(sourceFile),
        end: extractedProperty.getEnd(),
        replacement: `extracted: ${serializedValue}`,
      }
    : buildAppendEdit(enMessagesObject, enTsSourceText, serializedValue)

  const mergedText =
    enTsSourceText.slice(0, edit.start) + edit.replacement + enTsSourceText.slice(edit.end)
  return { mergedText, addedCount: added, totalExtractedCount: merged.size }
}

function findEnMessagesObjectLiteral(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === 'enMessages' && decl.initializer) {
        const init = unwrapExpression(decl.initializer)
        if (ts.isObjectLiteralExpression(init)) return init
      }
    }
  }
  throw new Error('i18n-extract: could not find "const enMessages = {...}" in en.ts')
}

function findTopLevelProperty(
  obj: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && getPropertyNameText(prop.name) === name) return prop
  }
  return undefined
}

function getPropertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text
  if (ts.isNumericLiteral(name)) return name.text
  return undefined
}

/** Recursively flattens an object literal (string leaves only — the `extracted` namespace never
 * contains function leaves) into a `{fullDotPath: text}` map. */
function flattenObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  prefix: string,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = getPropertyNameText(prop.name)
    if (!name) continue
    const path = `${prefix}.${name}`
    const value = prop.initializer
    if (ts.isObjectLiteralExpression(value)) {
      for (const [k, v] of flattenObjectLiteral(value, path)) map.set(k, v)
    } else if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      map.set(path, value.text)
    }
  }
  return map
}

/** Builds a nested plain-object tree from `{"extracted.a.b.c": text}` flat entries, keyed by the
 * path segments *after* the leading `extracted.` prefix. */
function buildNestedObject(flat: Map<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const [fullKey, text] of flat) {
    const segments = fullKey.split('.').slice(1)
    let node = root
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      if (typeof node[segment] !== 'object' || node[segment] === null) node[segment] = {}
      node = node[segment] as Record<string, unknown>
    }
    const leaf = segments.at(-1)
    if (leaf) node[leaf] = text
  }
  return root
}

function quoteLiteral(value: string): string {
  return `'${value
    .replace(/\\/g, String.raw`\\`)
    .replace(/'/g, String.raw`\'`)
    .replace(/\n/g, String.raw`\n`)
    .replace(/\r/g, String.raw`\r`)
    .replace(/\t/g, String.raw`\t`)}'`
}

/** Serializes a nested tree back to TS object-literal source text, sorting keys at every level
 * (so re-serialization is stable across runs) and always using quoted string keys (the namespace
 * is machine-generated only, so there's no need for bare-identifier validity). */
function serializeObject(node: Record<string, unknown>, ownerIndent: number): string {
  const childIndent = ' '.repeat(ownerIndent + 2)
  const closeIndent = ' '.repeat(ownerIndent)
  const keys = Object.keys(node).toSorted()
  const lines = keys.map(key => {
    const value = node[key]
    const rendered =
      typeof value === 'string'
        ? quoteLiteral(value)
        : serializeObject(value as Record<string, unknown>, ownerIndent + 2)
    return `${childIndent}${quoteLiteral(key)}: ${rendered},`
  })
  return `{\n${lines.join('\n')}\n${closeIndent}}`
}

function buildAppendEdit(
  enMessagesObject: ts.ObjectLiteralExpression,
  sourceText: string,
  serializedValue: string,
): { start: number; end: number; replacement: string } {
  const closeBracePos = enMessagesObject.getEnd() - 1
  let i = closeBracePos
  while (i > 0 && /\s/.test(sourceText[i - 1])) i--
  const needsComma = sourceText[i - 1] !== ','
  const prefix = needsComma ? ',' : ''
  return {
    start: closeBracePos,
    end: closeBracePos,
    replacement: `${prefix}\n  extracted: ${serializedValue},\n`,
  }
}
