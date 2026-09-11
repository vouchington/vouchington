import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../0503-00-00-youtube-rss-unreliable-status-codes.sql', import.meta.url),
  'utf8',
)

describe('youtube RSS unreliable status code seed', () => {
  it('keeps 404 retryable for YouTube hostnames', () => {
    expect(sql).toContain("'youtube.com'")
    expect(sql).toContain("'www.youtube.com'")
    expect(sql).toContain('ARRAY[404]::SMALLINT[]')
    expect(sql).toContain('INSERT INTO url_hostnames (hostname, crawlable, blocked')
    expect(sql).toContain('SELECT hostname, TRUE, blocked')
    expect(sql).toContain('FROM inherited\n  ORDER BY inherited.hostname')
    expect(sql).toContain('WHERE hostname IN (SELECT hostname FROM existing)')
    expect(sql).toContain('AND unreliable_status_codes IS NULL')
    expect(sql).toContain('INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)')
    expect(sql).toContain("'parent_hostname'")
  })
})
