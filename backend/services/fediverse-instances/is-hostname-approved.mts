import { getUrlHostnameByAny } from '@services/urls-hostnames'
import { findExistingInstanceByHostnameId } from './find-existing-instance.mts'
import { getFediverseInstanceAttributes } from './get-attributes.mts'

// Server allowlist gate for the inbound ActivityPub receiver (Phase C2): an inbound activity is
// only accepted from a hostname that has a fediverse_instance directory entry whose admin-set
// integration_status is 'approved'. A hostname with no directory entry, or one still 'pending' or
// explicitly 'blocked', is rejected. Composes the same three lookups the instance-directory API
// routes use (hostname -> topic -> attributes), with an early-return guard after each awaited
// lookup so no step runs against a nonexistent parent.
export async function isFediverseInstanceApprovedByHostname(hostname: string): Promise<boolean> {
  const urlHostname = await getUrlHostnameByAny(hostname)
  if (!urlHostname) return false

  const instance = await findExistingInstanceByHostnameId(urlHostname.id)
  if (!instance) return false

  const attributes = await getFediverseInstanceAttributes(instance.topic_id)
  if (!attributes) return false

  return attributes.integration_status === 'approved'
}
