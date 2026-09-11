import {
  hasBackgroundOperator,
  shellSegments,
  withoutShellComment,
} from './trivy-policy-shell-helpers.mts'

const SUBCOMMANDS = new Set(
  'image|fs|filesystem|rootfs|repo|repository|sbom|vm|k8s|kubernetes'.split('|'),
)
const GATE_OPTIONS = new Set(
  '--scanners|--quiet|--skip-db-update|--pkg-types|--exit-code|--severity|--ignore-unfixed|--ignorefile|--format|--table-mode|--output'.split(
    '|',
  ),
)
const SBOM_OPTIONS = new Set('--quiet|--skip-db-update|--exit-code|--format|--output'.split('|'))

export type TrivyInvocation = { args: string[]; source: string }

function tokens(command: string): string[] {
  const uncommented = withoutShellComment(command)
  return (uncommented.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map(token =>
    token.replace(/^("|')|("|')$/g, '').replace(/\\(.)/g, '$1'),
  )
}

function isPackageScan(args: string[]): boolean {
  return args.some(token => SUBCOMMANDS.has(token))
}

function isTrivyExecutable(token: string): boolean {
  return token === 'trivy' || /(?:^|\/)trivy$/.test(token)
}

function hasTrivyPackageScan(command: string): boolean {
  const commandTokens = tokens(command)
  const executable = commandTokens.findIndex(isTrivyExecutable)
  return executable !== -1 && isPackageScan(commandTokens.slice(executable + 1))
}

export function trivyExecutableInvocations(command: string): TrivyInvocation[] {
  const uncommented = withoutShellComment(command)
  if (/(?:\$\([^)]*|`[^`]*)\b(?:[^\s()`]+\/)?trivy(?:\s|\))/.test(uncommented))
    throw new Error(`${command.trim()}: unsupported Trivy command substitution`)
  if (/[<>]\(\s*(?:[^\s()]+\/)?trivy(?:\s|\))/.test(uncommented))
    throw new Error(`${command.trim()}: unsupported Trivy process substitution`)
  if (
    /\b(?:bash|sh|zsh)\s+-[A-Za-z]*c[A-Za-z]*\s+['"][^'"]*(?:[^\s()]+\/)?trivy(?:\s|$)/.test(
      uncommented,
    )
  )
    throw new Error(`${command.trim()}: unsupported indirect Trivy execution`)
  if (hasBackgroundOperator(uncommented) && hasTrivyPackageScan(uncommented))
    throw new Error(`${command.trim()}: unsupported background Trivy package scan`)
  return shellSegments(uncommented).flatMap(source => {
    if (/^\(\s*(?:[^\s()]+\/)?trivy(?:\s|\))/.test(source.trimStart()))
      throw new Error(`${source.trim()}: unsupported grouped Trivy package scan`)
    const segmentTokens = tokens(source)
    const evalIndex = segmentTokens.indexOf('eval')
    if (
      evalIndex !== -1 &&
      segmentTokens.slice(evalIndex + 1).some(token => /(?:^|\s|\/)trivy(?:\s|$)/.test(token))
    )
      throw new Error(`${source.trim()}: unsupported indirect Trivy execution`)
    const executable = segmentTokens.findIndex(isTrivyExecutable)
    if (executable === -1) return []
    const args = segmentTokens.slice(executable + 1)
    const leading = segmentTokens.slice(0, executable)
    if (leading.includes('echo')) return []
    if (leading.some(token => token !== 'env' && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token))) {
      if (isPackageScan(args))
        throw new Error(`${source.trim()}: unsupported wrapper before Trivy package scan`)
      return []
    }
    return [{ args, source }]
  })
}

export function trivyPackageScanSubcommand(command: string): string | undefined {
  return trivyExecutableInvocations(command)
    .flatMap(({ args }) => args)
    .find(token => SUBCOMMANDS.has(token))
}

export function isTrivyPackageScanCommand(command: string): boolean {
  return trivyPackageScanSubcommand(command) !== undefined
}

export function trivyPackageScanCommandSegments(command: string): string[] {
  const segments: string[] = []
  for (const { args, source } of trivyExecutableInvocations(command)) {
    if (isPackageScan(args)) segments.push(source)
  }
  return segments
}

function flagValues(command: string, flag: string): string[] {
  const values: string[] = []
  const commandTokens = policyTokens(command)
  for (const [index, token] of commandTokens.entries()) {
    if (token === flag && commandTokens[index + 1] && !commandTokens[index + 1]!.startsWith('--')) {
      values.push(commandTokens[index + 1]!)
    } else if (token.startsWith(`${flag}=`)) values.push(token.slice(flag.length + 1))
  }
  return values
}

function hasBareBoolean(command: string, flag: string): boolean {
  const commandTokens = policyTokens(command)
  const flagIndexes = commandTokens.flatMap((token, index) => (token === flag ? [index] : []))
  return (
    flagIndexes.length === 1 &&
    !commandTokens.some(token => token.startsWith(`${flag}=`)) &&
    !/^(?:false|true|0|1)$/i.test(commandTokens[flagIndexes[0]! + 1] ?? '')
  )
}

export function isDownloadDatabaseOnly(command: string): boolean {
  return hasBareBoolean(command, '--download-db-only')
}

function policyTokens(command: string): string[] {
  const commandTokens = tokens(command)
  const terminator = commandTokens.indexOf('--')
  return terminator === -1 ? commandTokens : commandTokens.slice(0, terminator)
}

function longOptions(command: string): string[] {
  const options: string[] = []
  for (const token of tokens(command)) {
    if (token === '--') break
    if (token.startsWith('-')) options.push(token.split('=')[0]!)
  }
  return options
}

function requireOnlyOptions(command: string, allowed: Set<string>, label: string): void {
  const option = longOptions(command).find(token => !allowed.has(token))
  if (option) throw new Error(`${label} must not include ${option}`)
}

function hasExactSet(command: string, flag: string, required: string[]): boolean {
  const actual = flagValues(command, flag).flatMap(value => value.split(','))
  return actual.length === required.length && actual.every(value => required.includes(value))
}

function requireFlag(condition: boolean, argument: string): void {
  if (!condition) throw new Error(`Trivy vulnerability scan must include ${argument}`)
}

export function assertVulnerabilityGate(command: string): void {
  requireOnlyOptions(command, GATE_OPTIONS, 'Trivy vulnerability scan')
  requireFlag(hasExactSet(command, '--scanners', ['vuln']), '--scanners vuln')
  requireFlag(hasBareBoolean(command, '--quiet'), '--quiet')
  requireFlag(hasBareBoolean(command, '--skip-db-update'), '--skip-db-update')
  requireFlag(hasExactSet(command, '--pkg-types', ['os']), '--pkg-types os')
  requireFlag(
    flagValues(command, '--exit-code').length === 1 &&
      flagValues(command, '--exit-code')[0] === '$TRIVY_FINDINGS_EXIT_CODE',
    '--exit-code "$TRIVY_FINDINGS_EXIT_CODE"',
  )
  requireFlag(hasExactSet(command, '--severity', ['CRITICAL', 'HIGH']), '--severity CRITICAL,HIGH')
  requireFlag(hasBareBoolean(command, '--ignore-unfixed'), '--ignore-unfixed')
  requireFlag(
    hasExactSet(command, '--ignorefile', ['.trivyignore.yaml']),
    '--ignorefile .trivyignore.yaml',
  )
  requireFlag(hasExactSet(command, '--format', ['table']), '--format table')
  requireFlag(hasExactSet(command, '--table-mode', ['detailed']), '--table-mode detailed')
  requireFlag(
    flagValues(command, '--output').length === 1 && flagValues(command, '--output')[0] !== '',
    '--output ',
  )
}

export function isComponentSbomGeneration(command: string): boolean {
  return (
    hasExactSet(command, '--format', ['cyclonedx']) &&
    trivyPackageScanSubcommand(command) !== 'sbom'
  )
}

export function assertUnfilteredComponentSbom(command: string): void {
  requireOnlyOptions(command, SBOM_OPTIONS, 'Trivy CycloneDX SBOM')
  if (!hasBareBoolean(command, '--quiet'))
    throw new Error('Trivy CycloneDX SBOM must include --quiet')
  if (!hasBareBoolean(command, '--skip-db-update'))
    throw new Error('Trivy CycloneDX SBOM must include --skip-db-update')
  if (!hasExactSet(command, '--exit-code', ['0']))
    throw new Error('Trivy CycloneDX SBOM must include --exit-code 0')
  if (!hasExactSet(command, '--format', ['cyclonedx']))
    throw new Error('Trivy CycloneDX SBOM must include --format cyclonedx')
  if (flagValues(command, '--output').length !== 1 || flagValues(command, '--output')[0] === '')
    throw new Error('Trivy CycloneDX SBOM must include --output ')
}
