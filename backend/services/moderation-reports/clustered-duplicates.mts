import { read } from '@data-stores/psql'
import { DUPLICATE_CLUSTER_THRESHOLD } from '@ts-shared/utils/moderation-reports'
import sql from 'sql-template-strings'
import type {
  ModerationReportDuplicateCluster,
  ModerationReportEntityCluster,
  PostIndicatorsById,
} from './clustered-types.mts'
import { appendUuidList, makeDuplicateCluster } from './clustered-utils.mts'

const DUPLICATE_CLUSTER_WINDOW_HOURS = 24
const EMBEDDINGS_SIMILARITY_THRESHOLD = 0.99

export async function buildDuplicateClusters(
  clusters: ModerationReportEntityCluster[],
  indicatorsByPostId: PostIndicatorsById,
): Promise<ModerationReportDuplicateCluster[]> {
  const postClusters = clusters.filter(cluster => cluster.entity_type === 'post')
  const duplicateClusters = buildContentHashDuplicateClusters(postClusters, indicatorsByPostId)
  const embeddingComponents = await selectEmbeddingSimilarityComponents(postClusters)

  for (const members of embeddingComponents) {
    if (members.length >= DUPLICATE_CLUSTER_THRESHOLD && isWithinDuplicateWindow(members)) {
      duplicateClusters.push(
        makeDuplicateCluster(
          `embeddings:${members
            .map(member => member.entity_id)
            .sort()
            .join(':')}`,
          'embeddings_similarity',
          members,
        ),
      )
    }
  }

  return duplicateClusters
}

async function selectEmbeddingSimilarityComponents(
  clusters: ModerationReportEntityCluster[],
): Promise<ModerationReportEntityCluster[][]> {
  if (clusters.length < DUPLICATE_CLUSTER_THRESHOLD) return []
  const byPostId = new Map(clusters.map(cluster => [cluster.entity_id, cluster]))
  const query = sql`/* listClusteredModerationReports:embeddingPairs */
    SELECT a.id AS left_id, b.id AS right_id
    FROM posts a
    JOIN posts b ON a.id < b.id
    WHERE a.id IN (`
  appendUuidList(query, [...byPostId.keys()])
  query.append(sql`)
      AND b.id IN (`)
  appendUuidList(query, [...byPostId.keys()])
  query.append(sql`)
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND a.bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND b.bedrock_nova_multimodal_v1_embedding IS NOT NULL
      -- self-distance = 0 filters zero-norm vectors; cosine distance is NaN for zero vectors.
      AND (a.bedrock_nova_multimodal_v1_embedding <=> a.bedrock_nova_multimodal_v1_embedding) = 0
      AND (b.bedrock_nova_multimodal_v1_embedding <=> b.bedrock_nova_multimodal_v1_embedding) = 0
      AND 1 - (a.bedrock_nova_multimodal_v1_embedding <=> b.bedrock_nova_multimodal_v1_embedding)
        >= ${EMBEDDINGS_SIMILARITY_THRESHOLD}
  `)
  const { rows } = await read<{ left_id: string; right_id: string }>(query)
  const parent = new Map<string, string>()
  for (const id of byPostId.keys()) parent.set(id, id)
  for (const row of rows) union(parent, row.left_id, row.right_id)

  const grouped = new Map<string, ModerationReportEntityCluster[]>()
  for (const [postId, cluster] of byPostId) {
    const root = find(parent, postId)
    const list = grouped.get(root) ?? []
    list.push(cluster)
    grouped.set(root, list)
  }
  return [...grouped.values()].filter(group => group.length >= DUPLICATE_CLUSTER_THRESHOLD)
}

function buildContentHashDuplicateClusters(
  postClusters: ModerationReportEntityCluster[],
  indicatorsByPostId: PostIndicatorsById,
) {
  const duplicateClusters: ModerationReportDuplicateCluster[] = []
  const byHash = new Map<string, ModerationReportEntityCluster[]>()
  for (const cluster of postClusters) {
    const hash = indicatorsByPostId.get(cluster.entity_id)?.contentHashHex
    if (!hash) continue
    const list = byHash.get(hash) ?? []
    list.push(cluster)
    byHash.set(hash, list)
  }
  for (const [hash, members] of byHash) {
    if (members.length >= DUPLICATE_CLUSTER_THRESHOLD && isWithinDuplicateWindow(members)) {
      duplicateClusters.push(
        makeDuplicateCluster(`content-hash:${hash}`, 'content_hash_duplicate', members),
      )
    }
  }
  return duplicateClusters
}

function isWithinDuplicateWindow(clusters: ModerationReportEntityCluster[]): boolean {
  const first = Math.min(...clusters.map(cluster => cluster.first_reported_at.getTime()))
  const last = Math.max(...clusters.map(cluster => cluster.last_reported_at.getTime()))
  return last - first <= DUPLICATE_CLUSTER_WINDOW_HOURS * 60 * 60 * 1000
}

function find(parent: Map<string, string>, id: string): string {
  const next = parent.get(id)
  if (!next || next === id) return id
  const root = find(parent, next)
  parent.set(id, root)
  return root
}

function union(parent: Map<string, string>, left: string, right: string) {
  const leftRoot = find(parent, left)
  const rightRoot = find(parent, right)
  if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
}
