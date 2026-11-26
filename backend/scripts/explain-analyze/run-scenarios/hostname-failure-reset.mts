import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames/get'
import { resetHostnameFailures } from '@services/urls-hostnames/network-backoff'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

type FailureState = {
  version: string
  consecutive_dns_failures: number
  consecutive_network_failures: number
  network_backoff_step: number
}

export async function runHostnameFailureResetScenarios(): Promise<void> {
  const prefix = randomUUID()
  const { rows } = await write<{ id: string; hostname: string }>(
    `/* seedHostnameFailureReset */ INSERT INTO url_hostnames
      (hostname, consecutive_dns_failures, consecutive_network_failures)
     VALUES ($1, 0, 0), ($2, 2, 3) RETURNING id, hostname`,
    [`clean-${prefix}.example`, `failures-${prefix}.example`],
  )
  const cleanHost = rows.find(row => row.hostname.startsWith('clean-'))!
  const cleanId = cleanHost.id
  const failuresId = rows.find(row => row.hostname.startsWith('failures-'))!.id
  try {
    await captureCrawlerHostnameLookup(cleanHost)
    const clean = await readFailureState(cleanId)
    await captureFailureReset('crawl-hostname-failure-reset-noop', cleanId, true, async () => {
      assert.deepEqual(await readFailureState(cleanId), clean)
    })
    const before = await readFailureState(failuresId)
    await captureFailureReset(
      'crawl-hostname-failure-reset-counters',
      failuresId,
      false,
      async () => {
        const after = await readFailureState(failuresId)
        assert.notEqual(after.version, before.version)
        assert.equal(after.consecutive_dns_failures, 2)
        assert.equal(after.consecutive_network_failures, 0)
        assert.equal(after.network_backoff_step, 0)
        await write(
          `/* restoreHostnameFailureReset */ UPDATE url_hostnames
         SET consecutive_network_failures = 3 WHERE id = $1`,
          [failuresId],
        )
      },
    )
  } finally {
    await write(
      '/* cleanupHostnameFailureReset */ DELETE FROM url_hostnames WHERE id = ANY($1::uuid[])',
      [[cleanId, failuresId]],
    )
  }
}

async function captureCrawlerHostnameLookup(host: { id: string; hostname: string }) {
  const scenario = 'crawl-hostname-details-point-read'
  registerScenarioContract(scenario, { expectations: [] })
  await runAndCapture(
    scenario,
    async () => {
      const details = await getUrlHostnameCrawlerDetailsById(host.id)
      assert.equal(details?.id, host.id)
      assert.equal(details.hostname, host.hostname)
      assert.equal(details.network_backoff_step, 0)
      assert.equal(details.network_backoff_ends_at, null)
    },
    undefined,
    'getUrlHostnameCrawlerDetailsById',
  )
}

async function captureFailureReset(
  scenario: string,
  id: string,
  includeDns: boolean,
  afterCapture: () => Promise<void>,
): Promise<void> {
  const annotation = 'resetHostnameFailures'
  registerScenarioContract(scenario, { allowEmptyResult: true, expectations: [] })
  await runAndCapture(
    scenario,
    () => resetHostnameFailures(id, { crawlerType: 'html', includeDns }),
    undefined,
    annotation,
    { exactCapturedNames: [annotation], afterCapture },
  )
}

async function readFailureState(id: string): Promise<FailureState> {
  const { rows } = await write<FailureState>(
    `/* checkHostnameFailureReset */ SELECT xmin::text AS version, consecutive_dns_failures,
       consecutive_network_failures, network_backoff_step FROM url_hostnames WHERE id = $1`,
    [id],
  )
  assert.ok(rows[0])
  return rows[0]
}
