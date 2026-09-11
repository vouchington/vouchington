import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  LOCAL_LLM_ENDPOINT_POLICY_SCHEMA,
  validateLocalLlmEndpointPolicyContract,
} from './local-llm-endpoint-policy-contract.mts'

const schema = readFileSync(
  new URL('../../api-fixtures/v1/local-llm-endpoint-policy.schema.json', import.meta.url),
  'utf8',
)

describe('local-LLM endpoint policy contract', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
  })

  function validate(contract: object | string, schemaContent = schema): string[] {
    const root = mkdtempSync(join(tmpdir(), 'voucha-local-llm-policy-'))
    roots.push(root)
    const path = join(root, LOCAL_LLM_ENDPOINT_POLICY_SCHEMA)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, schemaContent)
    return validateLocalLlmEndpointPolicyContract(
      typeof contract === 'string' ? contract : JSON.stringify(contract),
      root,
      [LOCAL_LLM_ENDPOINT_POLICY_SCHEMA],
    )
  }

  it('validates schema-owned consumer labels without native loader source ownership', () => {
    expect(
      validate(readFileSync('api-fixtures/v1/local-llm-endpoint-policy.json', 'utf8')),
    ).toEqual([])
  })

  it('rejects invalid JSON and invalid schema content', () => {
    expect(validate('{')).toEqual(expect.arrayContaining([expect.stringContaining('invalid JSON')]))
    expect(validate('{}', JSON.stringify({ type: 'unknown-json-schema-type' }))).toEqual(
      expect.arrayContaining([expect.stringContaining('is not a valid schema')]),
    )
  })
})
