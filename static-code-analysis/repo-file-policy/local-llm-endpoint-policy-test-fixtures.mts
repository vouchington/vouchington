import { readFile } from 'node:fs/promises'

import {
  LOCAL_LLM_ENDPOINT_POLICY_CONTRACT,
  LOCAL_LLM_ENDPOINT_POLICY_SCHEMA,
} from './local-llm-endpoint-policy-contract.mts'

type WriteFixtureFile = (path: string, content: string) => Promise<void>

export async function writeValidLocalLlmEndpointPolicyFixture(
  write: WriteFixtureFile,
): Promise<void> {
  const paths = [LOCAL_LLM_ENDPOINT_POLICY_CONTRACT, LOCAL_LLM_ENDPOINT_POLICY_SCHEMA]
  await Promise.all(
    paths.map(async path => {
      await write(path, await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
    }),
  )
}
