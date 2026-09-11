// ECS one-off diagnostic task entry (`aws ecs run-task` + `containerOverrides`), invoked per the
// staging verification gate in
// docs/overview/infrastructure/reference-networking-aws-application-endpoint-inventory.md. IPv6-only
// tasks have no ECS Exec, and the distroless image has neither a shell nor `dig` — this replaces
// shelling out to those tools with the equivalent checks via Node's own dns/fetch, the same way
// migrate.mts replaces a psql shell session for the migration task. Checking logic lives in
// verify-ipv6-egress-checks.mts and verify-ipv6-egress-vpc-evidence.mts, which are unit-tested;
// this file is the untested process entrypoint.
import { reportSection, runIpv6EgressVerification } from './verify-ipv6-egress-checks.mts'
import {
  reportApiEgressProxyConfig,
  reportApprovedFediverseInstanceHosts,
} from './verify-ipv6-egress-vpc-evidence.mts'

/* c8 ignore start -- process entrypoint for the ECS IPv6 verification task; run manually per the staging verification gate, not by CI. */
async function main(): Promise<void> {
  const { results, failures } = await runIpv6EgressVerification()
  if (failures.length > 0) {
    console.error(
      `::error::${failures.length}/${results.length} allowlisted hosts failed IPv6 verification: ${failures.map(f => f.host).join(', ')}`,
    )
    process.exitCode = 1
  } else {
    console.log(
      `All ${results.length} allowlisted hosts resolved AAAA and were TLS-reachable over IPv6.`,
    )
  }

  // These reach Valkey and Aurora, both VPC-internal — the only reason this ECS task exists
  // instead of running from a laptop (see A0 in the milestone-21 plan). Each is evidence-gathering
  // only; neither affects the exit code above, which stays scoped to the IPv6 egress check itself.
  const proxyConfigOk = await reportSection('api-egress-proxy-config', reportApiEgressProxyConfig)
  if (!proxyConfigOk) process.exitCode = 1

  const approvedHostsOk = await reportSection(
    'approved-fediverse-instance-hosts',
    reportApprovedFediverseInstanceHosts,
  )
  if (!approvedHostsOk) process.exitCode = 1

  // listApprovedFediverseInstanceHostnames
  // opens a Postgres pool connection; neither unrefs its socket, so without an explicit exit this
  // one-off task would hang past its own evidence output (matches @data-stores/psql/migrate.mts's
  // runAllMigrations, the other ECS one-off entrypoint that touches these same stores).
  process.exit(process.exitCode ?? 0)
}

await main()
/* c8 ignore stop */
