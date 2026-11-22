import type { JunitFile } from './junit.mts'

export type PlanJson = {
  selected_tests?: Array<string | { test_file: string }>
  fallback_triggered?: boolean
}

export type Measurement = {
  totalFiles: number
  plannedFiles: number
  unplannedFiles: number
  fallback: boolean
  savedSeconds: number
  totalSeconds: number
  misses: string[]
}

function sameFile(planned: string, ran: string): boolean {
  return planned === ran || planned.endsWith(`/${ran}`) || ran.endsWith(`/${planned}`)
}

/**
 * Compares the files a full run executed with the files the plan selected. A plan that fell back
 * to the full suite plans every file, so it saves nothing and cannot miss.
 */
export function measure(plan: PlanJson | undefined, files: readonly JunitFile[]): Measurement {
  const fallback = plan?.fallback_triggered === true
  const selected = (plan?.selected_tests ?? []).map(test =>
    typeof test === 'string' ? test : test.test_file,
  )
  const planned = (file: JunitFile) =>
    fallback || selected.some(candidate => sameFile(candidate, file.file))
  const unplanned = files.filter(file => !planned(file))
  return {
    totalFiles: files.length,
    plannedFiles: files.length - unplanned.length,
    unplannedFiles: unplanned.length,
    fallback,
    savedSeconds: unplanned.reduce((sum, file) => sum + file.seconds, 0),
    totalSeconds: files.reduce((sum, file) => sum + file.seconds, 0),
    misses: unplanned.flatMap(file => (file.failed ? [file.file] : [])),
  }
}
