# Article Sync Queue

Enqueues background jobs for syncing S3 markdown articles into posts.

## Queue Reference

| Queue          | Processor            | Deduplication    | Default Priority | Description                                   |
| -------------- | -------------------- | ---------------- | ---------------- | --------------------------------------------- |
| `article-sync` | `processArticleSync` | throttle (5 min) | 10               | Sync all S3 article markdown files into posts |

## Related

- Worker: [../../workers/article-sync/README.md](../../workers/article-sync/README.md)
- Service: [../../services/articles/](../../services/articles/)
- API: [../../api/v1/admin/README.md](../../api/v1/admin/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
