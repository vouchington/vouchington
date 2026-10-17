# Article Sync Queue

Source entrypoint: [backend/queues/article-sync/README.md](../../../../../backend/queues/article-sync/README.md)

Enqueues background jobs for syncing S3 markdown articles into posts. `article-sync` is a domain of the shared [`background`](../background/README.md) queue.

## Queue Reference

| Domain         | Processor                         | Group                  | Deduplication    | Default Priority | Description                                   |
| -------------- | --------------------------------- | ---------------------- | ---------------- | ---------------- | --------------------------------------------- |
| `article-sync` | `article-sync.processArticleSync` | domain-wide, 1 at once | throttle (5 min) | 10               | Sync all S3 article markdown files into posts |

The admin status endpoints read a job by id and treat an id that belongs to another domain of the shared queue as not found. Clients poll or subscribe to the pub/sub status stream; nothing waits on the job result.

## Related

- Worker: [../../workers/article-sync/README.md](../workers/article-sync/README.md)
- Service: [../../services/articles/](../../../../../backend/services/articles/)
- API: ../../api/v1/admin/README.md
- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
