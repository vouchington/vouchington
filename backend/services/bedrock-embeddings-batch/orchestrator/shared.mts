export type BatchMetadata = {
  url_id?: string
  crawl_id?: string
  inputSizeMB?: number
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
