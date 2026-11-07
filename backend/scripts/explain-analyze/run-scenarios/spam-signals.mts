import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import {
  checkContentHashDuplicate,
  checkEmbeddingsSimilarity,
} from '@services/spam-detection/duplicate-signals'
import { registerScenarioContract } from '../plan-expectations.mts'
import { heavyFollowUser, runAndCapture, seedPostId } from '../run-support.mts'

/**
 * Both moderation-signal probes run once per analyzed post. The content-hash probe must walk the
 * (hash, id) index inside the recent-id window; the similarity probe must order by the bare HNSW
 * distance and filter authors and the window inside the index scan.
 */
export async function runSpamSignalScenarios(): Promise<void> {
  const { rows } = await read<{ sha256: Buffer }>(
    `/* explainAnalyzeRun */ SELECT llm_moderation_content_sha256 AS sha256 FROM posts WHERE id = $1`,
    [seedPostId],
  )
  const sha256 = rows[0]?.sha256
  assert.ok(sha256, 'Spam signal scenarios require the seeded post')

  registerScenarioContract('spam-content-hash-duplicate', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['posts__default_llm_moderation_content_sha256_id_idx'],
        queryContains: 'checkContentHashDuplicate',
      },
      { kind: 'maxProcessedRows', relation: 'posts', max: 2 },
    ],
  })
  await runAndCapture('spam-content-hash-duplicate', async () => {
    const result = await checkContentHashDuplicate(sha256, heavyFollowUser.id)
    assert.equal(result.flagged, true, 'The seeded post must be found by its content hash')
  })

  registerScenarioContract('spam-embeddings-similarity', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['posts__default_bedrock_nova_multimodal_v1_embedding_idx'],
        queryContains: '/* checkEmbeddingsSimilarity */',
      },
    ],
  })
  // The probe embedding must have a zero self-distance; some seeded vectors round to a tiny
  // nonzero value, which the probe-side NaN guard rejects.
  const { rows: probes } = await read<{ id: string }>(
    `/* explainAnalyzeRun */ SELECT id FROM posts
     WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL
       AND (bedrock_nova_multimodal_v1_embedding <=> bedrock_nova_multimodal_v1_embedding) = 0
     ORDER BY id DESC LIMIT 1`,
  )
  const probeId = probes[0]?.id
  assert.ok(probeId, 'Spam signal scenarios require an embedded seeded post')
  await runAndCapture('spam-embeddings-similarity', async () => {
    const result = await checkEmbeddingsSimilarity(probeId, heavyFollowUser.id)
    assert.equal(result.details, undefined, 'The probe must run, not fall back to a skipped result')
  })
}
