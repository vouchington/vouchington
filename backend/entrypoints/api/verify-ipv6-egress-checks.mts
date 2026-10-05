// Diagnostic checks for the ECS IPv6 verification task. Split from verify-ipv6-egress.mts so this
// logic is unit-testable: that file's top-level `await` has no valid non-network code path to
// exercise in CI, so it stays a thin, coverage-ignored process entrypoint that calls back in here.
import {
  getIpv6VerificationHosts,
  reportRouteEvidence,
  resolveRecords,
  checkTlsReachable,
  type HostResult,
} from './verify-ipv6-egress-host-checks.mts'

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
  } catch (err) {
    console.error(
      JSON.stringify({
        kind: 'error',
        section: kind,
        message: err instanceof Error ? err.message : String(err),
      }),
    )
    return false
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
