import { listApprovedFediverseInstanceHostnames } from '@services/fediverse-instances'
import { apiEgressProxyConfig } from '@services/api-egress-proxy'

export async function reportApiEgressProxyConfig(): Promise<void> {
  await apiEgressProxyConfig.waitForInitialization()
  const fields = apiEgressProxyConfig.getFields()
  console.log(JSON.stringify({ kind: 'api-egress-proxy-config', fields }))

  const disabledProviders: string[] = []
  for (const [provider, enabled] of Object.entries(fields)) {
    if (enabled !== true) disabledProviders.push(provider)
  }
  if (disabledProviders.length > 0) {
    throw new Error(`API egress proxy routes are disabled: ${disabledProviders.join(', ')}`)
  }
}

// Evidence for A4: the ActivityPub AAAA ordering gate
// (vouchington-infra/opentofu/reference-human_checklist-phase-4-populate-ssm-parameter-store.md)
// checks approved fediverse_instance actor hosts before api's public IPv4 is removed.
// `POST /ap/inbox` queues unknown actors for the I/O worker; this VPC task reports the approved
// hostnames from Aurora for the external AAAA check. The actual lookup happens against this output,
// not inline here, so the same per-host resolver/failure semantics as `resolveRecords` apply.
export async function reportApprovedFediverseInstanceHosts(): Promise<void> {
  const approved = await listApprovedFediverseInstanceHostnames()
  const hosts = approved.map(instance => instance.hostname)
  console.log(
    JSON.stringify({ kind: 'approved-fediverse-instance-hosts', count: hosts.length, hosts }),
  )
}
