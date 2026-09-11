import { parseDistillClassifyArgs } from './args.mts'
import { readPartitionRecords } from './partition-records.mts'
import { classifySession } from './shape.mts'

function formatLine(sessionId: string, shape: string, eligible: boolean): string {
  return `${sessionId}\t${shape}\t${eligible ? 'eligible' : 'not-yet-eligible'}`
}

// Pure local JSONL parsing plus classification — no MCP, blackboard client, network, or writes, so
// this stays inside the retrospective-distill inspector contract ("must not invoke MCP, create
// issues, archive sessions, edit files, or retain a copy of the partition") and runs under Codex's
// read-only inspector sandbox profile.
export async function runDistillClassify(argv: string[]): Promise<string> {
  const args = parseDistillClassifyArgs(argv)
  const { sessions, entriesBySession } = await readPartitionRecords(args.partitionPath)
  if (sessions.length === 0) return 'No sessions found in partition.'

  const cutoffs = { retroCutoff: args.retroCutoff, sessionCutoff: args.sessionCutoff }
  return sessions
    .map(session => {
      const entries = entriesBySession.get(session.id) ?? []
      const { shape, eligible } = classifySession(session, entries, cutoffs)
      return formatLine(session.id, shape, eligible)
    })
    .join('\n')
}
