import { beginTransaction } from '@data-stores/psql'

export const BLOCKLISTED_DOMAIN_SEED_COUNT = 20_000
export const USER_AGENT_SEED_COUNT = 5_000

/** Domain-blocklist rows large enough that the policy batches must probe by key, not scan. */
export async function seedBlocklistedDomains(): Promise<void> {
  console.log(`Seeding ${BLOCKLISTED_DOMAIN_SEED_COUNT} blocklisted domains...`)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO domain_blocklist_sources (type, name, url)
    VALUES ('url', 'seed-explain-url-blocklist', 'https://seed.example.com/blocklist.txt')
    ON CONFLICT (name) DO NOTHING`,
  )
  await transaction(
    `/* seedExplainData */ INSERT INTO blocklisted_domains (source_id, domain)
    SELECT source.id, 'seed-blocked-' || n || '.example.net'
    FROM domain_blocklist_sources source, generate_series(0, $1::int - 1) AS n
    WHERE source.name = 'seed-explain-url-blocklist'
    ON CONFLICT DO NOTHING`,
    [BLOCKLISTED_DOMAIN_SEED_COUNT],
  )
  await transaction.commit()
}

/** The lookup the vote and session paths read first; sized so a miss would show as a scan. */
export async function seedUserAgentStrings(): Promise<void> {
  console.log(`Seeding ${USER_AGENT_SEED_COUNT} user agent strings...`)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO user_agent_strings (user_agent)
    SELECT 'seed-explain-agent/' || n FROM generate_series(0, $1::int - 1) AS n
    ON CONFLICT DO NOTHING`,
    [USER_AGENT_SEED_COUNT],
  )
  await transaction.commit()
}
