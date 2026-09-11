import { describe, expect, it } from 'vitest'

import {
  assertVulnerabilityGate,
  trivyPackageScanCommandSegments,
} from './trivy-policy-helpers.mts'

const completeGate =
  'trivy image --scanners vuln --quiet --skip-db-update --pkg-types os --exit-code "$TRIVY_FINDINGS_EXIT_CODE" --severity CRITICAL,HIGH --ignore-unfixed --ignorefile .trivyignore.yaml --format table --table-mode detailed --output report.txt target'

describe('Trivy policy shell parsing', () => {
  it('normalizes continued executable names before discovery', () => {
    const commands = trivyPackageScanCommandSegments('tri\\\nvy image target')
    expect(commands).toEqual(['trivy image target'])
    expect(() => assertVulnerabilityGate(commands[0]!)).toThrow(
      'Trivy vulnerability scan must include --scanners vuln',
    )
  })

  it('continues after comments and separates newline commands', () => {
    const commands = trivyPackageScanCommandSegments(`# benign setup\n${completeGate}`)
    expect(commands).toEqual([completeGate])
    expect(() => assertVulnerabilityGate(commands[0]!)).not.toThrow()
  })

  it('rejects wrapped substitutions and shell -c clusters', () => {
    for (const command of ['echo "$(command trivy image target)"', "bash -lc 'trivy image target'"])
      expect(() => trivyPackageScanCommandSegments(command)).toThrow(
        /unsupported (Trivy command substitution|indirect Trivy execution)/,
      )
  })
})
