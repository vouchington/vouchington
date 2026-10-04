import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { createImportBatch } from '@services/admin-imports/create-batch'
import { updateRowCompleted } from '@services/admin-imports/update-row-status'
import { publishImportProgress } from '@data-stores/valkey-pubsub'

describe('GET /api/v1/imports/:batchId/stream live events', () => {
  it('streams live import progress and the terminal event after its initial snapshot', async () => {
    const user = await createTestUser()
    const { batch, rowIds } = await createImportBatch(
      user,
      'rss_feed',
      [{ url: 'https://live-stream.example.com/rss' }],
      { source: 'test' },
    )
    const feed = await createTestRssFeed({})
    const request = createRequest()
    await request.authenticateAs(user)
    let completed = false
    const response = await request
      .get(`/api/v1/imports/${batch.id}/stream`)
      .timeout(5000)
      .buffer(true)
      .parse((stream, done) => {
        let body = ''
        stream.on('data', (chunk: Buffer) => {
          body += chunk.toString()
          if (completed || !body.includes('event: progress\n')) return
          completed = true
          void updateRowCompleted(rowIds[0]!, feed.id)
            .then(progress => publishImportProgress(batch.id, progress))
            .catch(err => stream.destroy(err))
        })
        stream.on('end', () => done(null, body))
        stream.on('error', done)
      })
      .expect('Content-Type', /text\/event-stream/)
      .expect(200)

    expect(response.body).toBe(
      `event: progress\ndata: ${JSON.stringify({ batchId: batch.id, completed: 0, failed: 0, total: 1, done: false })}\n\n` +
        `event: progress\ndata: ${JSON.stringify({ batchId: batch.id, completed: 1, failed: 0, total: 1, done: true })}\n\n` +
        'event: done\ndata: {}\n\n',
    )
  })
})
