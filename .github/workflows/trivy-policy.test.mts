import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  assertNoUnsupportedTrivyAction,
  assertNoUnsupportedTrivyShellSource,
  assertUnfilteredComponentSbom,
  assertVulnerabilityGate,
  isComponentSbomGeneration,
  isTrivyPackageScanCommand,
  isShellPolicySource,
  parseIgnoreRegistry,
  trivyPackageScanCommandSegments,
  trivyPackageScanCommands,
  validateIgnoreRegistry,
  type Ignore,
} from './trivy-policy-helpers.mts'

function futureDate(days = 14): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('Trivy policy', () => {
  it('requires OS gates, unfiltered component SBOMs, and an on-disk exception registry', () => {
    const commands = trivyPackageScanCommands()
    const sboms = commands.filter(isComponentSbomGeneration)
    const gates = commands.filter(command => !isComponentSbomGeneration(command))
    expect(gates.length).toBeGreaterThanOrEqual(2)
    expect(sboms.length).toBeGreaterThanOrEqual(2)
    for (const command of gates) expect(() => assertVulnerabilityGate(command)).not.toThrow()
    for (const command of sboms) expect(() => assertUnfilteredComponentSbom(command)).not.toThrow()
    expect(existsSync('.trivyignore.yaml')).toBe(true)
    validateIgnoreRegistry(parseIgnoreRegistry(readFileSync('.trivyignore.yaml', 'utf8')))
  })

  it('routes ignore-only changes to tooling', () => {
    const workflow = readFileSync('.github/ci-path-filters.yml', 'utf8')
    const tooling = workflow.slice(
      workflow.indexOf('tooling:'),
      workflow.indexOf('cloudflare-worker:'),
    )
    expect(tooling).toContain("- '.trivyignore.yaml'")
    expect(trivyPackageScanCommands([])).toEqual([])
  })

  it('ignores deleted shell sources still present in index metadata', () =>
    expect(trivyPackageScanCommands(['deleted-but-still-indexed.sh'])).toEqual([]))

  it('recognizes extensionless executable shell entrypoints', () => {
    expect(isShellPolicySource('dev/initialize')).toBe(true)
    expect(isShellPolicySource('ci/with-node-test-options')).toBe(true)
    expect(isShellPolicySource('package.json')).toBe(false)
  })

  it('recognizes global flags, quoted subcommands, and Kubernetes aliases', () => {
    for (const command of [
      'trivy --quiet image target',
      'trivy "image" target',
      `trivy \\
  --quiet \\
  image target`,
      'trivy k8s cluster',
      'trivy kubernetes cluster',
    ])
      expect(isTrivyPackageScanCommand(command)).toBe(true)
    expect(isTrivyPackageScanCommand('echo trivy image')).toBe(false)
    for (const command of [
      'if trivy image target',
      'command trivy image target',
      'timeout 5m trivy image target',
    ])
      expect(() => isTrivyPackageScanCommand(command)).toThrow(
        'unsupported wrapper before Trivy package scan',
      )
    expect(() => isTrivyPackageScanCommand('(trivy image target)')).toThrow(
      'unsupported grouped Trivy package scan',
    )
  })

  it('rejects incomplete, sbom, action, and shell-script scan forms', () => {
    const complete =
      'trivy filesystem --scanners vuln --quiet --skip-db-update --pkg-types os --exit-code "$TRIVY_FINDINGS_EXIT_CODE" --severity CRITICAL,HIGH --ignore-unfixed --ignorefile .trivyignore.yaml --format table --table-mode detailed --output report.txt rootfs'
    expect(() => assertVulnerabilityGate(complete)).not.toThrow()
    expect(() => assertVulnerabilityGate(complete.replace('--severity CRITICAL,HIGH', ''))).toThrow(
      'Trivy vulnerability scan must include --severity CRITICAL,HIGH',
    )
    expect(() => assertVulnerabilityGate(`${complete} -- --target`)).not.toThrow()
    expect(() =>
      assertVulnerabilityGate(
        `${complete.replace('--scanners vuln ', '')} -- --scanners vuln --severity CRITICAL,HIGH`,
      ),
    ).toThrow('Trivy vulnerability scan must include --scanners vuln')
    const pathQualifiedGate = trivyPackageScanCommandSegments('./trivy image target')
    expect(pathQualifiedGate).toEqual(['./trivy image target'])
    expect(() => assertVulnerabilityGate(pathQualifiedGate[0]!)).toThrow(
      'Trivy vulnerability scan must include --scanners vuln',
    )
    for (const executable of ['\\trivy', 'triv\\y', '/opt/homebrew/bin/triv\\y']) {
      const escapedGate = trivyPackageScanCommandSegments(`${executable} image target`)
      expect(() => assertVulnerabilityGate(escapedGate[0]!)).toThrow(
        'Trivy vulnerability scan must include --scanners vuln',
      )
    }
    expect(() =>
      assertVulnerabilityGate(
        `${complete.replace('--scanners vuln ', '')} # --scanners vuln --pkg-types os`,
      ),
    ).toThrow('Trivy vulnerability scan must include --scanners vuln')
    for (const [needle, replacement, message] of [
      ['--scanners vuln', '--scanners vuln,secret', '--scanners vuln'],
      ['--pkg-types os', '--pkg-types os,library', '--pkg-types os'],
      ['--severity CRITICAL,HIGH', '--severity CRITICAL,HIGH,MEDIUM', '--severity CRITICAL,HIGH'],
      ['--ignore-unfixed', '--ignore-unfixed=false', '--ignore-unfixed'],
      ['--output report.txt', '--output=', '--output '],
    ]) {
      expect(() => assertVulnerabilityGate(complete.replace(needle, replacement))).toThrow(
        `Trivy vulnerability scan must include ${message}`,
      )
    }
    for (const replacement of ['', '--skip-db-update=false', '--skip-db-update --skip-db-update'])
      expect(() =>
        assertVulnerabilityGate(complete.replace('--skip-db-update', replacement)),
      ).toThrow('Trivy vulnerability scan must include --skip-db-update')
    for (const [flag, value] of [
      ['--quiet', 'true'],
      ['--quiet', 'False'],
      ['--quiet', '0'],
      ['--ignore-unfixed', 'true'],
      ['--ignore-unfixed', 'False'],
      ['--ignore-unfixed', '0'],
    ])
      expect(() => assertVulnerabilityGate(complete.replace(flag, `${flag}=${value}`))).toThrow(
        `Trivy vulnerability scan must include ${flag}`,
      )
    expect(() =>
      assertVulnerabilityGate(complete.replace('--quiet', '--quiet --quiet=false')),
    ).toThrow('Trivy vulnerability scan must include --quiet')
    for (const option of [
      '--ignore-status',
      '--skip-files ignored',
      '--skip-dirs ignored',
      '--unknown',
    ])
      expect(() => assertVulnerabilityGate(`${complete} ${option}`)).toThrow(
        `Trivy vulnerability scan must not include ${option.split(' ')[0]}`,
      )
    expect(() => assertVulnerabilityGate(`${complete} -s LOW`)).toThrow(
      'Trivy vulnerability scan must not include -s',
    )
    const mixedGates = trivyPackageScanCommandSegments(
      `trivy image target; ${complete.replace('trivy filesystem', 'trivy image')}`,
    )
    expect(mixedGates).toHaveLength(2)
    expect(() => assertVulnerabilityGate(mixedGates[0]!)).toThrow(
      'Trivy vulnerability scan must include --scanners vuln',
    )
    expect(() => assertVulnerabilityGate(mixedGates[1]!)).not.toThrow()
    const pipedGate = trivyPackageScanCommandSegments('echo x | trivy image target')
    expect(pipedGate).toEqual([' trivy image target'])
    expect(() => assertVulnerabilityGate(pipedGate[0]!)).toThrow(
      'Trivy vulnerability scan must include --scanners vuln',
    )
    expect(trivyPackageScanCommandSegments('echo x # | trivy image target')).toEqual([])
    expect(() =>
      trivyPackageScanCommandSegments(`trivy image target & printf '${complete}'`),
    ).toThrow('unsupported background Trivy package scan')
    expect(() => trivyPackageScanCommandSegments(`${complete} &`)).toThrow(
      'unsupported background Trivy package scan',
    )
    for (const command of ['report=$(trivy image target)', 'report=`trivy image target`'])
      expect(() => trivyPackageScanCommandSegments(command)).toThrow(
        'unsupported Trivy command substitution',
      )
    expect(() =>
      trivyPackageScanCommandSegments(`<(/opt/homebrew/bin/trivy image target); ${complete}`),
    ).toThrow('unsupported Trivy process substitution')
    expect(() => trivyPackageScanCommandSegments("bash -c 'trivy image target'")).toThrow(
      'unsupported indirect Trivy execution',
    )
    for (const command of ["eval 'trivy image target'", "eval 'command trivy image target'"])
      expect(() => trivyPackageScanCommandSegments(command)).toThrow(
        'unsupported indirect Trivy execution',
      )
    expect(() => assertVulnerabilityGate('trivy sbom --format cyclonedx input.cdx.json')).toThrow(
      'Trivy vulnerability scan must include --scanners vuln',
    )
    const componentSbom =
      'trivy image --quiet --skip-db-update --exit-code 0 --format cyclonedx --output sbom.cdx.json rootfs'
    expect(() => assertUnfilteredComponentSbom(componentSbom)).not.toThrow()
    for (const argument of [
      '--scanners vuln',
      '--pkg-types os',
      '--severity HIGH',
      '--ignore-unfixed true',
      '--ignorefile .trivyignore.yaml',
      '--scanners=vuln',
      '--pkg-types=os',
      '--severity=HIGH',
      '--ignore-unfixed=true',
      '--ignorefile=.trivyignore.yaml',
    ])
      expect(() => assertUnfilteredComponentSbom(`${componentSbom} ${argument}`)).toThrow(
        'Trivy CycloneDX SBOM must not include',
      )
    for (const replacement of ['', '--skip-db-update=false', '--skip-db-update --skip-db-update'])
      expect(() =>
        assertUnfilteredComponentSbom(componentSbom.replace('--skip-db-update', replacement)),
      ).toThrow('Trivy CycloneDX SBOM must include --skip-db-update')
    expect(() => assertUnfilteredComponentSbom(`${componentSbom} --unknown`)).toThrow(
      'Trivy CycloneDX SBOM must not include --unknown',
    )
    expect(() => assertUnfilteredComponentSbom(`${componentSbom} -q`)).toThrow(
      'Trivy CycloneDX SBOM must not include -q',
    )
    expect(() => assertNoUnsupportedTrivyAction('aquasecurity/trivy-action')).toThrow(
      'unsupported Trivy action',
    )
    expect(() => assertNoUnsupportedTrivyShellSource('trivy --version', 'fixture.sh')).not.toThrow()
    for (const flag of ['--download-db-only=false', '--download-db-only --download-db-only'])
      expect(() =>
        assertNoUnsupportedTrivyShellSource(`trivy image ${flag} target`, 'fixture.sh'),
      ).toThrow('fixture.sh: unsupported Trivy shell-script scan')
    expect(() =>
      assertNoUnsupportedTrivyShellSource('trivy image --download-db-only target', 'fixture.sh'),
    ).not.toThrow()
    expect(() =>
      assertNoUnsupportedTrivyShellSource(
        'trivy image target; trivy image --download-db-only',
        'fixture.sh',
      ),
    ).toThrow('fixture.sh: unsupported Trivy shell-script scan')
  })

  it('validates narrow temporary exception entries', () => {
    const versionedPurl = (parts: string[]): string => parts.join('')
    const valid = {
      id: 'CVE-2026-0001',
      purls: [versionedPurl(['pkg:deb/debian/curl@', ['8', '0', '1'].join('.'), '?arch=amd64'])],
      statement:
        'Not exploitable: package is not installed. Cleanup: https://github.com/vouchington/vouchington/issues/1',
      expired_at: futureDate(),
    }
    const plusName = versionedPurl([
      'pkg:deb/debian/libstdc++6@',
      ['14', '2', '0-19'].join('.'),
      '?arch=amd64',
    ])
    const encodedName = versionedPurl([
      'pkg:deb/debian/libstdc%2B%2B6@',
      ['14', '2', '0-19'].join('.'),
      '?arch=amd64',
    ])
    const failures: Array<[Ignore, string]> = [
      [
        { ...valid, purls: [versionedPurl(['pkg:npm/sharp@', ['0', '35', '0'].join('.')])] },
        'vulnerabilities[0].purls must contain exact versioned package purls',
      ],
      [
        { ...valid, purls: [encodedName.replace('%2B', '%2G')] },
        'vulnerabilities[0].purls must contain exact versioned package purls',
      ],
      [
        { ...valid, purls: [encodedName.replace('%2B', '%')] },
        'vulnerabilities[0].purls must contain exact versioned package purls',
      ],
      [
        {
          ...valid,
          statement:
            'Exploitable: reaches package. Cleanup: https://github.com/vouchington/vouchington/issues/1',
        },
        'vulnerabilities[0].statement must give exploitability rationale and cleanup issue URL',
      ],
      [
        { ...valid, expired_at: '2020-01-01T00:00:00Z' },
        'vulnerabilities[0].expired_at must be a UTC calendar date',
      ],
      [
        { ...valid, expired_at: futureDate(31) },
        'vulnerabilities[0].expired_at must be no more than 30 days away',
      ],
    ]
    expect(() => validateIgnoreRegistry({ vulnerabilities: [valid] })).not.toThrow()
    expect(() =>
      validateIgnoreRegistry({ vulnerabilities: [{ ...valid, purls: [plusName] }] }),
    ).not.toThrow()
    expect(() =>
      validateIgnoreRegistry({ vulnerabilities: [{ ...valid, purls: [encodedName] }] }),
    ).not.toThrow()
    const unquotedDateRegistry = parseIgnoreRegistry(
      `vulnerabilities:\n  - id: ${valid.id}\n    purls:\n      - ${valid.purls[0]}\n    statement: ${JSON.stringify(valid.statement)}\n    expired_at: ${valid.expired_at}\n`,
    )
    expect(() => validateIgnoreRegistry(unquotedDateRegistry)).not.toThrow()
    for (const [ignore, message] of failures)
      expect(() => validateIgnoreRegistry({ vulnerabilities: [ignore] })).toThrow(message)
  })
})
