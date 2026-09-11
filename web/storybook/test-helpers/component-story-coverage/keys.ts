import ts from 'typescript'

import {
  type ReexportTarget,
  type RuntimeImport,
  componentRoot,
  exportKey,
  parseSourceFile,
} from './source'
import { resolveSource, usedRuntimeImports } from './imports'

export function coveredComponentKeys(
  storyFiles: string[],
  trackedFileSet: ReadonlySet<string>,
): Set<string> {
  const covered = new Set<string>()

  for (const file of storyFiles) {
    for (const runtimeImport of usedRuntimeImports(file)) {
      if (runtimeImport.namespace) continue
      const resolved = resolveSource(file, runtimeImport.source, trackedFileSet)
      if (!resolved?.startsWith(componentRoot)) continue
      for (const key of coveredComponentKeysForImport(
        resolved,
        runtimeImport.imported,
        trackedFileSet,
      )) {
        covered.add(key)
      }
    }
  }

  return covered
}

export function coveredComponentKeysForImport(
  file: string,
  exportName: string,
  trackedFileSet: ReadonlySet<string>,
  seen = new Set<string>(),
): string[] {
  const key = exportKey(file, exportName)
  if (seen.has(key)) return []
  seen.add(key)

  return [
    key,
    ...namedReexportTargets(file, exportName, trackedFileSet).flatMap(target =>
      coveredComponentKeysForImport(target.file, target.exportName, trackedFileSet, seen),
    ),
  ]
}

export function namedReexportTargets(
  file: string,
  exportName: string,
  trackedFileSet: ReadonlySet<string>,
  sourceFile = parseSourceFile(file),
): ReexportTarget[] {
  const targets: ReexportTarget[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue

    const resolved = resolveSource(file, statement.moduleSpecifier.text, trackedFileSet)
    if (!resolved?.startsWith(componentRoot)) continue

    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue
      if (element.name.text !== exportName) continue
      targets.push({
        file: resolved,
        exportName: element.propertyName?.text ?? element.name.text,
      })
    }
  }

  return targets
}

export function namespaceComponentImports(
  storyFiles: string[],
  trackedFileSet: ReadonlySet<string>,
): RuntimeImport[] {
  const imports: RuntimeImport[] = []

  for (const file of storyFiles) {
    for (const runtimeImport of usedRuntimeImports(file)) {
      if (!runtimeImport.namespace) continue
      const resolved = resolveSource(runtimeImport.file, runtimeImport.source, trackedFileSet)
      if (!resolved?.startsWith(componentRoot)) continue
      imports.push(runtimeImport)
    }
  }

  return imports
}
