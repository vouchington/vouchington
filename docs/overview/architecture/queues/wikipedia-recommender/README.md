# Wikipedia Recommender Scheduler Tombstone

Source entrypoint: [backend/queues/wikipedia-recommender/README.md](../../../../../backend/queues/wikipedia-recommender/README.md)

The Wikipedia recommender queue, worker, jobs, and automated recommendations are retired. This
package retains only an empty scheduled-job manifest so normal worker startup removes the former
`wikipedia-recommender-dispatch` scheduler from every deployed Valkey environment.

The standalone cleanup script remains available for an explicit operator run, but deployment does
not depend on it.

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- Scheduled-job tombstone contract: [../../modules/scheduled-job-manifest/README.md](../../backend/modules/scheduled-job-manifest/README.md)
