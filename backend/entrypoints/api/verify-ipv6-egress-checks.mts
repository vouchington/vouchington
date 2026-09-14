// Diagnostic checks for the ECS IPv6 verification task. Split from verify-ipv6-egress.mts so this
// logic is unit-testable: that file's top-level `await` has no valid non-network code path to
// exercise in CI, so it stays a thin, coverage-ignored process entrypoint that calls back in here.
import { resolve4, resolve6 } from 'node:dns/promises'
import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import { getExternalFetch } from '@modules/utils/http-dispatchers'
import { getConfiguredSentryHost, IPV6_ALLOWLIST } from '@modules/utils/ipv6-allowlist'

// Mirrors @modules/aws/config's default; not imported directly to keep this diagnostic entrypoint
// free of the AWS SDK client dependency surface it does not otherwise need.
const TLS_TIMEOUT_MS = 5_000

export function getIpv6VerificationHosts(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const awsRegion = env.AWS_REGION ?? 'us-west-2'
  const sentryHost = getConfiguredSentryHost(env)
  if (isDeployedEnvironment(env) && sentryHost === undefined) {
    throw new Error(
      'SENTRY_DSN is required and must be valid for deployed IPv6 egress verification.',
    )
  }
  return [
    ...(sentryHost === undefined ? [] : [sentryHost]),
    ...IPV6_ALLOWLIST,
    `s3.dualstack.${awsRegion}.amazonaws.com`,
  ]
}

export type HostResult = {
  host: string
  a: string[]
  aaaa: string[]
  tlsReachable: boolean
  tlsError?: string
}

export type VerificationOutcome = {
  results: HostResult[]
  failures: HostResult[]
}

// Runs one evidence section without letting its failure hide the others' output — each section
// reaches a different dependency (Valkey, Aurora) that the ECS task's whole purpose is to prove
// reachable, so a single unreachable dependency should surface as one failed section, not an
// unhandled rejection that aborts the rest of the evidence-gathering run. Lives here rather than in
// the coverage-ignored entrypoint because it is pure control flow with no process-lifecycle
// dependency, so — unlike `main()` — it has a real non-network code path to unit test.
export async function reportSection(kind: string, run: () => Promise<void>): Promise<boolean> {
  try {
    await run()
    return true
  } catch (error) {
    console.error(
      JSON.stringify({
        kind: 'error',
        section: kind,
        message: error instanceof Error ? error.message : String(error),
      }),
    )
    return false
  }
}

export function reportRouteEvidence(): void {
  const addresses = Object.entries(networkInterfaces()).flatMap(([interfaceName, addrs]) =>
    (addrs ?? []).map(addr => ({ interfaceName, ...addr })),
  )
  // AWS auto-assigns every IPv6-only ENI a 169.254.0.0/16 link-local IPv4 address (for IMDS
  // compatibility) even though the ENI has no real IPv4 path — Node reports it as `internal:
  // false`. `ipv6-allowlist.mts`'s isPrivateOrLoopbackHost already treats this same range as
  // exempt for egress-guardrail purposes; this check must exempt it too or it fails on every
  // correctly configured IPv6-only task.
  const hasNonLoopbackIpv4 = addresses.some(
    addr => addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.'),
  )
  const hasNonLoopbackIpv6 = addresses.some(addr => addr.family === 'IPv6' && !addr.internal)
  console.log(
    JSON.stringify({ kind: 'route-evidence', addresses, hasNonLoopbackIpv4, hasNonLoopbackIpv6 }),
  )

  if (hasNonLoopbackIpv4) {
    throw new Error('Task has a non-loopback IPv4 address; this task is not IPv6-only.')
  }
  if (!hasNonLoopbackIpv6) {
    throw new Error('Task has no non-loopback IPv6 address.')
  }
}

export async function resolveRecords(host: string): Promise<Pick<HostResult, 'a' | 'aaaa'>> {
  const hostname = new URL(`https://${host}`).hostname
  const literalHost =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  if (isIP(literalHost) === 6) return { a: [], aaaa: [literalHost] }

  const [a, aaaa] = await Promise.all([
    resolve4(hostname).catch(() => []),
    resolve6(hostname).catch(() => []),
  ])
  return { a, aaaa }
}

/* no-mistakes: integration=http */
export async function checkTlsReachable(
  host: string,
): Promise<Pick<HostResult, 'tlsReachable' | 'tlsError'>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TLS_TIMEOUT_MS)
  try {
    // Any HTTP response (including a 403/404 policy rejection) proves the TLS handshake and IPv6
    // route succeeded; only a network-level throw (abort, ECONNREFUSED, DNS failure) means unreachable.
    await getExternalFetch()(`https://${host}/`, { method: 'HEAD', signal: controller.signal })
    return { tlsReachable: true }
  } catch (error) {
    return { tlsReachable: false, tlsError: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function runIpv6EgressVerification(
  env: NodeJS.ProcessEnv = process.env,
): Promise<VerificationOutcome> {
  reportRouteEvidence()

  const results: HostResult[] = []
  for (const host of getIpv6VerificationHosts(env)) {
    // oxlint-disable-next-line no-await-in-loop -- sequential, human-readable evidence output; this is a one-off diagnostic task, not a hot path
    const [records, tls] = await Promise.all([resolveRecords(host), checkTlsReachable(host)])
    results.push({ host, ...records, ...tls })
  }
  console.log(JSON.stringify({ kind: 'host-results', results }, null, 2))

  const failures = results.filter(result => result.aaaa.length === 0 || !result.tlsReachable)
  return { results, failures }
}
