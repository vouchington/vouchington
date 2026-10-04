import ts from 'typescript'

import { guardLineage, validatorDominatesRead } from './request-validation-route-guards.mts'

/** Conditional body/path validation never proves an unconditional route carrier. */
export function admitValidator(
  call: ts.CallExpression,
  operation: string,
  families: ReadonlySet<string>,
  checker: ts.TypeChecker,
  conditionalCall: boolean,
  validated: Set<string>,
  guardedQueryValidators: ts.CallExpression[],
  carrierFamilies?: Map<string, Set<string>>,
): void {
  const lineage = guardLineage(call, checker)
  if (!conditionalCall && lineage === '[]') {
    validated.add(operation)
    const recorded = carrierFamilies?.get(operation) ?? new Set<string>()
    for (const family of families) recorded.add(family)
    carrierFamilies?.set(operation, recorded)
  } else if (!conditionalCall && lineage !== undefined && families.has('query')) {
    guardedQueryValidators.push(call)
  }
}

/** A conditional query validator counts only when every downstream read shares its path. */
export function admitGuardedQuery(
  operation: string,
  validators: readonly ts.CallExpression[],
  reads: readonly ts.Node[],
  checker: ts.TypeChecker,
  validated: Set<string>,
  carrierFamilies?: Map<string, Set<string>>,
): void {
  if (validators.length === 0 || reads.length === 0) return
  if (!reads.every(read => validatorDominatesRead(validators, read, checker))) return
  validated.add(operation)
  const families = carrierFamilies?.get(operation) ?? new Set<string>()
  families.add('query')
  carrierFamilies?.set(operation, families)
}
