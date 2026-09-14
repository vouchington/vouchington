import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
export interface ComponentExport {
  key: string
  file: string
  exportName: string
  displayName: string
}
export interface RuntimeImport {
  file: string
  source: string
  imported: string
  local: string
  namespace: boolean
  typeOnly: boolean
}
export interface ReexportTarget {
  file: string
  exportName: string
}
export const componentRoot = 'web/components/'
export const storybookRoot = 'web/storybook/'
export const sourceExtensions = ['.tsx', '.ts'] as const
export const repoRoot = findRepoRoot(process.cwd())
const sourceFileCache = new Map<string, ts.SourceFile>()
function findRepoRoot(cwd: string): string {
  let current = cwd

  while (true) {
    if (
      existsSync(path.join(current, componentRoot)) &&
      existsSync(path.join(current, storybookRoot))
    ) {
      return current
    }

    if (
      path.basename(current) === 'web' &&
      existsSync(path.join(current, 'components')) &&
      existsSync(path.join(current, 'storybook'))
    ) {
      return path.dirname(current)
    }

    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(`Could not find repository root from ${cwd}`)
    }
    current = parent
  }
}
const STORY_FILE_RE = /[.]stories[.](ts|tsx)$/
export function isStoryFile(file: string): boolean {
  return STORY_FILE_RE.test(file)
}

export function parseSourceFile(file: string): ts.SourceFile {
  const cached = sourceFileCache.get(file)
  if (cached) return cached

  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(path.join(repoRoot, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  sourceFileCache.set(file, sourceFile)
  return sourceFile
}

const PASCAL_CASE_RE = /^[A-Z][A-Za-z0-9]*$/
export function isPascalCase(name: string): boolean {
  return PASCAL_CASE_RE.test(name)
}

export function exportKey(file: string, exportName: string): string {
  return `${file}#${exportName}`
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false)
  )
}

export function namedComponentExports(
  file: string,
  sourceFile = parseSourceFile(file),
): ComponentExport[] {
  const exports: ComponentExport[] = []

  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
    const hasDefaultModifier =
      modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ?? false
    if (
      hasExportModifier(statement) &&
      !hasDefaultModifier &&
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isVariableStatement(statement))
    ) {
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
        const name = statement.name?.text
        if (name && isPascalCase(name)) {
          exports.push({ key: exportKey(file, name), file, exportName: name, displayName: name })
        }
        continue
      }

      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && isPascalCase(declaration.name.text)) {
          const name = declaration.name.text
          exports.push({ key: exportKey(file, name), file, exportName: name, displayName: name })
        }
      }
      continue
    }

    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || !statement.exportClause)
      continue
    if (!ts.isNamedExports(statement.exportClause)) continue
    if (statement.moduleSpecifier) continue

    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue
      const name = element.name.text
      if (isPascalCase(name)) {
        exports.push({ key: exportKey(file, name), file, exportName: name, displayName: name })
      }
    }
  }

  return exports
}

export function defaultComponentExports(
  file: string,
  sourceFile = parseSourceFile(file),
): ComponentExport[] {
  const exports: ComponentExport[] = []

  for (const statement of sourceFile.statements) {
    const hasDefaultExport =
      ts.canHaveModifiers(statement) &&
      (ts
        .getModifiers(statement)
        ?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ??
        false) &&
      (ts
        .getModifiers(statement)
        ?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
        false)

    if (!hasDefaultExport) continue

    const displayName =
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name
        ? statement.name.text
        : 'default'

    exports.push({ key: exportKey(file, 'default'), file, exportName: 'default', displayName })
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue
    const displayName = ts.isIdentifier(statement.expression)
      ? statement.expression.text
      : 'default'
    if (displayName === 'default' || isPascalCase(displayName)) {
      exports.push({ key: exportKey(file, 'default'), file, exportName: 'default', displayName })
    }
  }

  return exports
}

export function componentExports(files: string[]): ComponentExport[] {
  const exports: ComponentExport[] = []
  for (const file of files) {
    if (!file.startsWith(componentRoot)) continue
    if (!file.endsWith('.tsx')) continue
    if (file.includes('/__tests__/') || file.includes('.test.')) continue
    if (!componentHasDataPw(file)) continue
    const sourceFile = parseSourceFile(file)
    exports.push(
      ...namedComponentExports(file, sourceFile),
      ...defaultComponentExports(file, sourceFile),
    )
  }
  return exports
}

function componentHasDataPw(file: string): boolean {
  return /['"]data-pw['"]|data-pw=/.test(readFileSync(path.join(repoRoot, file), 'utf8'))
}
