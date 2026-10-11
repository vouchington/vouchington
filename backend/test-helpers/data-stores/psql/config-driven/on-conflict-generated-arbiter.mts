import type { GeneratedArbiterInput } from 'vouchington-tooling/pg-schema-snapshot'

/** A STORED generated arbiter moves when a source column is assigned a new value. */
export type GeneratedArbiterVerdict =
  | { violation: false }
  | { violation: true; column: string; generatedColumn: string }

export function generatedArbiterViolation(
  input: GeneratedArbiterInput,
  generatedDependencies: ReadonlyMap<string, ReadonlySet<string>>,
): GeneratedArbiterVerdict {
  if (input.action !== 'doUpdate') return { violation: false }
  if (!input.complete) return { violation: true, column: '?', generatedColumn: '?' }

  const arbiterColumns =
    input.keyColumns === undefined
      ? generatedDependencies.keys()
      : new Set([...input.keyColumns, ...input.predicateColumns])
  const protectedSources = new Map<string, string>()
  for (const arbiterColumn of arbiterColumns) {
    for (const source of generatedDependencies.get(arbiterColumn) ?? []) {
      protectedSources.set(source, arbiterColumn)
    }
  }

  for (const assignment of input.assignments) {
    if (!assignment.complete || assignment.columns.length === 0) {
      return { violation: true, column: '?', generatedColumn: '?' }
    }
    for (const column of assignment.columns) {
      const generatedColumn = protectedSources.get(column)
      if (generatedColumn === undefined) continue
      if (
        assignment.columns.length === 1 &&
        !assignment.hasIndirection &&
        assignment.referencedColumn === column
      ) {
        continue
      }
      return { violation: true, column, generatedColumn }
    }
  }
  return { violation: false }
}
