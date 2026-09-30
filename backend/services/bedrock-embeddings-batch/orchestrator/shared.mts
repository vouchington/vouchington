/** Stored in the batch document. */
export type BatchMetadata = {
  inputSizeMB?: number
}

/** Stored only in the batch's url_id and crawl_id foreign-key columns. */
export type BatchSource = {
  urlId?: string
  crawlId?: string
}

export type BatchResultItem = {
  recordId: string
  modelOutput?: {
    embedding?: number[]
    embeddings?: Array<{ embedding: number[] } | number[]>
    inputTokenCount?: number
  }
  error?: unknown
}
