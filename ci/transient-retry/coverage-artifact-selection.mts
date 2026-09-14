import { coverageProducerGroup } from '../coverage-suites.mts'

function selectedCoverageSuites(log: string): string[] {
  return [...log.matchAll(/\[optional-run-artifacts\] selected artifact=coverage-([\w-]+)\n/g)].map(
    match => match[1],
  )
}

export function hasCoverageArtifactSelection(log: string, producerGroup: string): boolean {
  return selectedCoverageSuites(log).some(suite => {
    if (suite === producerGroup) return true
    try {
      return coverageProducerGroup(suite) === producerGroup
    } catch {
      return false
    }
  })
}
