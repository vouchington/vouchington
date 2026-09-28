# @services/moderation-audit-facts

Pure column projections for moderation audit rows. Writers and test readers share these
parsers so relational audit facts stay one shape. This package has no workspace dependencies,
which lets `@voucha/test-helpers` import it without a service/test-helper cycle.

## Related

- [Post clearance](../post-clearance/README.md)
- [Moderation training](../moderation-training/README.md)
- [Community agent prompt audit](../community-agent-prompt-audit/README.md)
