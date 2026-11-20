export interface IgnoredDependencyEvidence {
  dependency: string
  evidenceFiles: readonly string[]
  evidencePattern: RegExp
}

// #5635: owner-required lower-only declarations; atomic stack #5654 must not deploy
// its lower layer independently. Upper PR #5653 removes these declarations and policy.
const retainedDependencies: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['backend/api', ['@queues/bedrock-embeddings-batch', '@services/bedrock-embeddings-batch']],
  ['backend/entrypoints/worker-cpu', ['@queues/bedrock-embeddings-batch']],
  ['backend/entrypoints/worker-io', ['@workers/bedrock-batch-sqs']],
  ['backend/scripts', ['@services/bedrock-embeddings-batch']],
  ['backend/services/crawl-chunks', ['@services/bedrock-embeddings']],
  ['backend/services/entity-listener-reconciliation', ['@services/bedrock-embeddings']],
  ['backend/services/openai-moderation', ['@queues/bedrock-embeddings-batch']],
  ['backend/services/posts', ['@queues/bedrock-embeddings', '@services/bedrock-embeddings']],
  ['backend/services/queue-monitoring', ['@queues/bedrock-embeddings-batch']],
  [
    'backend/services/rss-feed-items',
    ['@queues/bedrock-embeddings', '@services/bedrock-embeddings'],
  ],
  ['backend/services/topics', ['@services/bedrock-embeddings']],
  ['backend/worker-runtime', ['@services/bedrock-embeddings']],
  [
    'backend/workers/background-cpu',
    ['@aws-sdk/client-bedrock', '@queues/bedrock-embeddings-batch'],
  ],
  ['backend/workers/bloom-filters', ['@services/bedrock-embeddings']],
  ['backend/workers/entity-listeners', ['@queues/bedrock-embeddings']],
]

export function withRetainedBedrockDependencies(
  allowed: Map<string, readonly IgnoredDependencyEvidence[]>,
): Map<string, readonly IgnoredDependencyEvidence[]> {
  for (const [workspace, dependencies] of retainedDependencies) {
    const evidence = dependencies.map(dependency => ({
      dependency,
      evidenceFiles: [`${workspace}/package.json`],
      evidencePattern: new RegExp(String.raw`"${RegExp.escape(dependency)}"\s*:`),
    }))
    allowed.set(workspace, [...(allowed.get(workspace) ?? []), ...evidence])
  }
  return new Map([...allowed].toSorted(([left], [right]) => left.localeCompare(right)))
}
