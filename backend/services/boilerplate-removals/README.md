# @services/boilerplate-removals

CRUD and search for boilerplate removal rules — CSS selectors used to strip repeated template content from crawled pages.

## Key exports

- `createBoilerplateRemoval(currentUserId, input)` — creates a new rule
- `getBoilerplateRemoval(id)` — retrieves a rule by ID
- `searchBoilerplateRemovals(options)` — paginated rule search
- `deleteBoilerplateRemoval(currentUserId, id)` — soft-deletes a rule

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Boilerplate removal system: [../../queues/crawl-boilerplate-removal/README.md](../../queues/crawl-boilerplate-removal/README.md)
