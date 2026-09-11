# Follow-ups

[Back to Runtime Timeouts](runtime-timeouts.md#follow-ups)

Remaining follow-up and scope caveat:

1. `article-sync` worker has no explicit `lockDuration`; set one from its heartbeat and
   crash-recovery requirements rather than coupling it to the SSE connection cycle. Follow-up:
   [#8122](https://github.com/jonathanong/filaments/issues/8122)
2. Full durable replayability remains tracked by
   [JOB-REPLAYABILITY](../requirements/platform/JOB-REPLAYABILITY.md). These connection guardrails
   do not claim that every producer is recoverable from PostgreSQL.
