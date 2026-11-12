import { createHash } from 'node:crypto'

/** Retained Nova fixtures use their original raw joined-text identity until upper removal. */
export function createBedrockTopicEmbeddingContent(topic: {
  name: string
  aliases?: string[]
  markdown?: string
}) {
  const content = `${topic.name}\n${(topic.aliases ?? []).join(' ')}\n${topic.markdown ?? ''}`
  return { content, content_sha256: hashBedrockEmbeddingContent(content) }
}

export function hashBedrockEmbeddingContent(content: string): Buffer {
  return createHash('sha256').update(content).digest()
}
