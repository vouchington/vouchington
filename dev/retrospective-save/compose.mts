import { isUtf8 } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import {
  composeRetrospective,
  type RetrospectiveCompositionInput,
} from 'vouchington-tooling/agent-blackboard'

import { parseFlagArgs } from '../blackboard/parse-flag-args.mts'
import { validateRetroDoc } from '../retrospective-validate.mts'

// The portable composer owns generated facts, transcript normalization, friction and assessments.
// JSON contains options and narrative, never executable collectors or transport implementations.
export async function runCompose(argv: string[]): Promise<string> {
  const { parsed, positional } = parseFlagArgs<{ input?: string }>(argv, { '--input': 'input' })
  if (positional.length || !parsed.input) throw new Error('compose requires --input <json-file>')
  const buffer = await readFile(parsed.input)
  if (!isUtf8(buffer) || buffer.length > 256 * 1024)
    throw new Error('composition input must be bounded UTF-8 JSON')
  const input = JSON.parse(buffer.toString('utf8')) as RetrospectiveCompositionInput
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('composition input must be an object')
  const markdown = await composeRetrospective(input)
  const validation = validateRetroDoc(markdown)
  if (!validation.ok)
    throw new Error(`composed retrospective failed validation: ${validation.errors.join('; ')}`)
  return markdown
}
