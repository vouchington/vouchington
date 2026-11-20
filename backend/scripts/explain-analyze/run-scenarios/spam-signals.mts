import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import {
  checkContentHashDuplicate,
  checkEmbeddingsSimilarity,
  SIMILARITY_MAX_SCAN_TUPLES,
  SIMILARITY_SCAN_SETTINGS,
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
        indexes: ['posts__default_gemini_embedding_2_embedding_idx'],
        queryContains: '/* checkEmbeddingsSimilarity */',
      },
      // The HNSW scan may visit at most max_scan_tuples index tuples under the replayed settings.
      { kind: 'maxProcessedRows', relation: 'posts', max: SIMILARITY_MAX_SCAN_TUPLES },
    ],
  })
  // seedSemanticPosts gives this fixed source a recent, other-author exact-vector duplicate.
  // Selecting any self-distance-zero row does not guarantee a qualifying neighbour.
  const { rows: probes } = await read<{ id: string }>(
    `/* explainAnalyzeRun */ SELECT id FROM posts
     WHERE id = $1
       AND gemini_embedding_2_embedding IS NOT NULL
       AND (gemini_embedding_2_embedding <=> gemini_embedding_2_embedding) = 0`,
    [seedPostId],
  )
  const probeId = probes[0]?.id
  assert.ok(probeId, 'Spam signal scenarios require an embedded seeded post')
  await runAndCapture(
    'spam-embeddings-similarity',
    async () => {
      const result = await checkEmbeddingsSimilarity(probeId, heavyFollowUser.id)
      assert.equal(
        result.details,
        undefined,
        'The probe must run, not fall back to a skipped result',
      )
    },
    undefined,
    'checkEmbeddingsSimilarity',
    { localSettings: SIMILARITY_SCAN_SETTINGS },
  )
}
