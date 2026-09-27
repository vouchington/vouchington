import { isUtf8 } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import {
  composeRetrospective,
  type RetrospectiveCompositionInput,
} from 'vouchington-tooling/agent-blackboard'
import type { RetrospectiveFactsOptions } from 'vouchington-tooling/retrospective-facts'
import type { ResolveOptions } from 'vouchington-tooling/retrospective-transcript'

import type { BlackboardEntriesClient } from '../blackboard/client.mts'
import { parseFlagArgs } from '../blackboard/parse-flag-args.mts'
import { validateRetroDoc } from '../retrospective-validate.mts'
import { frictionReportOptions } from '../session-friction/report.mts'

type Unassessed = { status: 'unavailable' | 'not-assessed'; reason: string }
type SerializableFacts =
  | Omit<RetrospectiveFactsOptions, 'execute' | 'onWarning' | 'raw'>
  | Unassessed
type SerializableTranscript = Omit<ResolveOptions, 'env'> | Unassessed
type SerializableCompositionInput = Omit<
  RetrospectiveCompositionInput,
  'facts' | 'transcript' | 'friction'
> & { facts: SerializableFacts; transcript: SerializableTranscript }

function optionRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`composition JSON collector options for ${name} must be an object`)
  return value as Record<string, unknown>
}

function collectorOptions(
  value: Record<string, unknown>,
  name: string,
  fields: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key))
      throw new Error(`composition JSON collector options cannot include ${name}.${key}`)
  }
}

function serializableInput(value: unknown): SerializableCompositionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('composition input must be an object')
  const input = value as Record<string, unknown>
  collectorOptions(input, 'input', [
    'sessionId',
    'date',
    'issues',
    'prs',
    'description',
    'repositories',
    'workOutcome',
    'feedbackCoverage',
    'narrative',
    'facts',
    'transcript',
    'tools',
    'architecture',
    'knownSensitiveValues',
  ])
  const facts = optionRecord(input.facts, 'facts')
  collectorOptions(
    facts,
    'facts',
    'status' in facts ? ['status', 'reason'] : ['pr', 'branch', 'noPr', 'repo'],
  )
  const transcript = optionRecord(input.transcript, 'transcript')
  collectorOptions(
    transcript,
    'transcript',
    'status' in transcript
      ? ['status', 'reason']
      : ['sessionId', 'jsonlPath', 'projectsDir', 'codexSessionsDir', 'grokSessionsDir', 'cwd'],
  )
  if (transcript.sessionId !== undefined && transcript.sessionId !== input.sessionId)
    throw new Error('composition transcript sessionId must match composition sessionId')
  return input as SerializableCompositionInput
}

// The portable composer owns generated facts, transcript normalization, friction and assessments.
// JSON contains options and narrative, never executable collectors or transport implementations.
export async function runCompose(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  entriesClient?: BlackboardEntriesClient,
): Promise<string> {
  const { parsed, positional } = parseFlagArgs<{ input?: string }>(argv, { '--input': 'input' })
  if (positional.length || !parsed.input) throw new Error('compose requires --input <json-file>')
  const buffer = await readFile(parsed.input)
  if (!isUtf8(buffer) || buffer.length > 256 * 1024)
    throw new Error('composition input must be bounded UTF-8 JSON')
  const input = serializableInput(JSON.parse(buffer.toString('utf8')) as unknown)
  const markdown = await composeRetrospective({
    ...input,
    friction: frictionReportOptions(env, entriesClient),
  })
  const validation = validateRetroDoc(markdown)
  if (!validation.ok)
    throw new Error(`composed retrospective failed validation: ${validation.errors.join('; ')}`)
  return markdown
}
