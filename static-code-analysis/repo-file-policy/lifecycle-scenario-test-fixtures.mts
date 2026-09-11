import { readFile } from 'node:fs/promises'

import {
  LIFECYCLE_ADAPTERS,
  LIFECYCLE_SCENARIO_CONTRACT,
  LIFECYCLE_SCENARIO_SCHEMA,
} from './lifecycle-scenario-contract.mts'

export type LifecycleScenarioFixture = 'missing' | 'untracked' | 'valid'

type WriteFixtureFile = (path: string, content: string) => Promise<void>

export async function writeValidLifecycleScenarioFixture(write: WriteFixtureFile): Promise<void> {
  const [contract, schema] = await Promise.all([
    readFile(new URL('../../api-fixtures/v1/lifecycle-scenarios.json', import.meta.url), 'utf8'),
    readFile(
      new URL('../../api-fixtures/v1/lifecycle-scenarios.schema.json', import.meta.url),
      'utf8',
    ),
  ])
  const evidenceContents = new Map<string, string[]>()
  for (const [name, adapter] of Object.entries(LIFECYCLE_ADAPTERS)) {
    evidenceContents.set(adapter.evidence.manifest, [
      ...(evidenceContents.get(adapter.evidence.manifest) ?? []),
      'lifecycle-scenarios.json',
    ])
    evidenceContents.set(adapter.evidence.dispatch, [
      ...(evidenceContents.get(adapter.evidence.dispatch) ?? []),
      name,
    ])
  }
  await Promise.all([
    write(LIFECYCLE_SCENARIO_CONTRACT, contract),
    write(LIFECYCLE_SCENARIO_SCHEMA, schema),
    ...[...evidenceContents].map(([path, contents]) => write(path, contents.join('\n'))),
  ])
}
