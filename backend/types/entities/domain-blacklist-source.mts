import { createHash } from 'node:crypto'

export type DomainBlacklistType = 'url' | 'email'

export type DomainBlacklistSource = {
  type: DomainBlacklistType
  name: string
  url: string
}

export type DomainBlacklistSourceId = string | number

export const BLACKLISTS: DomainBlacklistSource[] = [
  {
    type: 'url',
    name: 'ultimate-hosts-blacklist',
    url: 'https://hosts.ubuntu101.co.za/domains.list',
  },
  {
    type: 'email',
    name: 'disposable-email-domain-list',
    url: 'https://raw.githubusercontent.com/unkn0w/disposable-email-domain-list/refs/heads/main/domains.txt',
  },
  {
    type: 'email',
    name: 'disposable-email-domains',
    url: 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/refs/heads/main/disposable_email_blocklist.conf',
  },
  ...[
    'abuse',
    'ads',
    'crypto',
    'drugs',
    'fraud',
    'gambling',
    'malware',
    'phishing',
    'piracy',
    'porn',
    'ransomware',
    'redirect',
    'scam',
    'torrent',
    'tracking',
    'vaping',
  ].map((name): DomainBlacklistSource => ({
    type: 'url',
    name: `blocklistproject-${name}`,
    url: `https://raw.githubusercontent.com/blocklistproject/Lists/main/alt-version/${name}-nl.txt`,
  })),
]
/** Shared Valkey namespace version for source-type-dependent Bloom and validation results. */
export function getDomainBlacklistSourceTypeVersion(
  sources: ReadonlyArray<Pick<DomainBlacklistSource, 'name' | 'type'>> = BLACKLISTS,
): string {
  const identities = sources
    .map(({ name, type }) => ({ name, type }))
    .toSorted((left, right) => left.name.localeCompare(right.name))
  return createHash('sha256').update(JSON.stringify(identities)).digest('hex').slice(0, 16)
}
