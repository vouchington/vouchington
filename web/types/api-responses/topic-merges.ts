export interface TopicMergeResponseBody {
  topic_merge: {
    id: string
    source_topic_id: string
    destination_topic_id: string
    status: 'queued' | 'running' | 'completed' | 'failed'
    stage: string
    created_at: string
    completed_at: string | null
    error_code: string | null
    status_url: string
  }
}
