import { parseFlagArgs } from '../blackboard/parse-flag-args.mts'

export type DistillClassifyArgs = {
  partitionPath: string
  retroCutoff: string
  sessionCutoff: string
}

type ParsedFlags = {
  retroCutoffFlag?: string
  sessionCutoffFlag?: string
}

const FLAG_KEYS: Record<string, keyof ParsedFlags> = {
  '--retro-cutoff': 'retroCutoffFlag',
  '--session-cutoff': 'sessionCutoffFlag',
}

function requireIsoCutoff(value: string | undefined, flag: string): string {
  if (value === undefined) throw new Error(`${flag} is required`)
  if (Number.isNaN(Date.parse(value))) throw new Error(`${flag} must be a valid ISO 8601 timestamp`)
  return value
}

// The classifier never computes its own cutoffs — SKILL.md's eligibility rule is evaluated against
// whatever `retroCutoff`/`sessionCutoff` the caller (the distill inspector, which already derives
// these once from `--retro-days`/`--session-days`) passes in, so a classifier run always matches the
// inspector's own idea of "eligible" for that same run.
export function parseDistillClassifyArgs(argv: string[]): DistillClassifyArgs {
  const { parsed, positional } = parseFlagArgs<ParsedFlags>(argv, FLAG_KEYS)
  if (positional.length !== 1) {
    throw new Error('expected exactly one positional argument: the partition JSONL path')
  }
  return {
    partitionPath: positional[0],
    retroCutoff: requireIsoCutoff(parsed.retroCutoffFlag, '--retro-cutoff'),
    sessionCutoff: requireIsoCutoff(parsed.sessionCutoffFlag, '--session-cutoff'),
  }
}
