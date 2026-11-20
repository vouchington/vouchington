import { read } from '@data-stores/psql'

export async function getSeededTopicEmbeddingIdentities(slugs: readonly string[]) {
  const { rows } = await read<{
    created_via: string
    slug: string
    name: string
    aliases: string[]
    markdown: string | null
    content_sha256: Buffer
  }>(
    `/* getSeededTopicEmbeddingIdentities */ SELECT slug,name,aliases,markdown,created_via,
      gemini_embedding_2_content_sha256 AS content_sha256 FROM topics WHERE slug = ANY($1::text[])`,
    [slugs],
  )
  return rows
}
