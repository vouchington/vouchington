import { parse } from 'yaml'
import {
  areaCoverageReusableViolations,
  areaLcovViolations,
} from './workflow-area-coverage-lcov.mts'
import type { Workflow } from './workflow-area-coverage-model.mts'
import { areaWiringViolations } from './workflow-area-coverage-wiring.mts'

/** Evaluate the repository's area coverage protocol over finite supplied workflow sources. */
export function areaCoveragePolicyViolations(sources: Readonly<Record<string, string>>): string[] {
  const documents: Record<string, Workflow> = {}
  const violations: string[] = []
  for (const [path, source] of Object.entries(sources)) {
    try {
      const document = parse(source) as Workflow | null
      documents[path] = document ?? {}
    } catch {
      violations.push(`${path}: invalid workflow YAML`)
    }
  }
  if (violations.length > 0) return violations
  return [
    ...areaWiringViolations(documents),
    ...areaLcovViolations(documents),
    ...areaCoverageReusableViolations(sources, documents),
  ]
}
