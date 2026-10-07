/* v8 ignore start -- test support module exercised by schema-static-analysis.test.mts */
export type TypeViolation = {
  table_name: string
  column_name: string
  data_type: string
  udt_name: string
}

export function formatTypeViolations(violations: TypeViolation[]): string[] {
  return violations.map(
    violation =>
      `${violation.table_name}.${violation.column_name}: ${violation.data_type}/${violation.udt_name}`,
  )
}
/* v8 ignore stop */
