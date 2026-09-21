# Wikipedia Recommender Scheduler Tombstone

The Wikipedia recommender queue, worker, jobs, and automated recommendations are retired. This
package retains only an empty scheduled-job manifest so normal worker startup removes the former
`wikipedia-recommender-dispatch` scheduler from every deployed Valkey environment.

The standalone cleanup script remains available for an explicit operator run, but deployment does
not depend on it.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Scheduled-job tombstone contract: [../../modules/scheduled-job-manifest/README.md](../../modules/scheduled-job-manifest/README.md)
