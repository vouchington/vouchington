import path from 'node:path'
import ts from 'typescript'

import {
  type RuntimeImport,
  isStoryFile,
  parseSourceFile,
  sourceExtensions,
  storybookRoot,
} from './source'

export function resolveSource(
  fromFile: string,
  source: string,
  trackedFileSet: ReadonlySet<string>,
): string | null {
  const rawPath = source.startsWith('@/')
    ? path.posix.join('web', source.slice(2))
    : source.startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), source))
      : null

  if (!rawPath) return null
  for (const extension of sourceExtensions) {
    const candidate = `${rawPath}${extension}`
    if (trackedFileSet.has(candidate)) return candidate
  }
  for (const extension of sourceExtensions) {
    const candidate = path.posix.join(rawPath, `index${extension}`)
    if (trackedFileSet.has(candidate)) return candidate
  }
  if (trackedFileSet.has(rawPath)) return rawPath
  return null
}

// isTypeOnly is deprecated in TypeScript 7; cast bypasses the warning
// while preserving runtime behaviour (the property remains functional).
function getIsTypeOnly(node: ts.ImportClause | ts.ImportSpecifier): boolean {
  return (node as unknown as { isTypeOnly: boolean }).isTypeOnly
}

export function runtimeImports(file: string, sourceFile = parseSourceFile(file)): RuntimeImport[] {
  const imports: RuntimeImport[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    const source = statement.moduleSpecifier.text
    const importClause = statement.importClause
    if (!importClause) continue

    if (importClause.name) {
      imports.push({
        file,
        source,
        imported: 'default',
        local: importClause.name.text,
        namespace: false,
        typeOnly: getIsTypeOnly(importClause),
      })
    }

    const namedBindings = importClause.namedBindings
    if (!namedBindings) continue
    if (ts.isNamespaceImport(namedBindings)) {
      imports.push({
        file,
        source,
        imported: '*',
        local: namedBindings.name.text,
        namespace: true,
        typeOnly: getIsTypeOnly(importClause),
      })
      continue
    }

    for (const element of namedBindings.elements) {
      imports.push({
        file,
        source,
        imported: element.propertyName?.text ?? element.name.text,
        local: element.name.text,
        namespace: false,
        typeOnly: getIsTypeOnly(importClause) || getIsTypeOnly(element),
      })
    }
  }

  return imports
}

function sourceFileUsesIdentifier(sourceFile: ts.SourceFile, name: string): boolean {
  let used = false

  const visit = (node: ts.Node): void => {
    if (used || ts.isImportDeclaration(node)) return
    if (
      ts.isIdentifier(node) &&
      node.text === name &&
      !isDeclarationIdentifier(node) &&
      !isTypeOnlyIdentifier(node)
    ) {
      used = true
      return
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return used
}

function isDeclarationIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent
  return (
    ((ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent)) &&
      parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node)
  )
}

function isTypeOnlyIdentifier(node: ts.Identifier): boolean {
  let current: ts.Node = node
  while (current.parent) {
    const parent = current.parent
    if (
      ts.isTypeNode(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isHeritageClause(parent)
    ) {
      return true
    }
    current = parent
  }
  return false
}

const usedRuntimeImportCache = new Map<string, RuntimeImport[]>()

export function usedRuntimeImports(file: string, sourceFile?: ts.SourceFile): RuntimeImport[] {
  if (!sourceFile) {
    const cached = usedRuntimeImportCache.get(file)
    if (cached) return cached
    const imports = usedRuntimeImports(file, parseSourceFile(file))
    usedRuntimeImportCache.set(file, imports)
    return imports
  }

  return runtimeImports(file, sourceFile).filter(runtimeImport => {
    if (runtimeImport.typeOnly) return false
    return sourceFileUsesIdentifier(sourceFile, runtimeImport.local)
  })
}

export function reachableStorybookFiles(files: string[]): string[] {
  const trackedFileSet = new Set(files)
  const queue: string[] = []
  for (const file of files) {
    if (!file.startsWith(storybookRoot)) continue
    if (!isStoryFile(file)) continue
    queue.push(file)
  }
  const seen = new Set<string>()

  while (queue.length > 0) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const runtimeImport of usedRuntimeImports(file)) {
      const resolved = resolveSource(file, runtimeImport.source, trackedFileSet)
      if (resolved?.startsWith(storybookRoot)) queue.push(resolved)
    }
  }

  return [...seen].toSorted()
}
