# Agent Responses API

Server-side agent execution with SSE streaming results. Clients submit a task, receive a stream of progress events, and can reconnect to retrieve results.

## Endpoints

| Method | Route                                | Authentication | HTTP Caching | Description                           |
| ------ | ------------------------------------ | -------------- | ------------ | ------------------------------------- |
| POST   | `/api/v1/agent-responses`            | Required       | No           | Start an agent run, stream SSE events |
| GET    | `/api/v1/agent-responses/:id`        | Required       | No           | Get agent response snapshot           |
| GET    | `/api/v1/agent-responses/:id/stream` | Required       | No           | Reattach SSE stream for a running run |
| DELETE | `/api/v1/agent-responses/:id`        | Required       | No           | Cancel an agent run                   |

## SSE Events

Events emitted on `POST` and `GET .../stream`:

| Event      | Payload                                                | Description                        |
| ---------- | ------------------------------------------------------ | ---------------------------------- |
| `metadata` | `{ agent_response_id, job_id: string \| null, agent }` | Run metadata, emitted first        |
| `progress` | `{ content?, tool_name? }`                             | Incremental text or tool call name |
| `done`     | `{ content }`                                          | Final summary text (terminal)      |
| `error`    | `{ error }`                                            | Error message (terminal)           |

On `POST`, the first `metadata` event is emitted as soon as the durable agent-response row exists,
with `job_id: null` while queueing is pending. A second `metadata` event refreshes `job_id` after
the job is durably enqueued. Clients should retain `agent_response_id` from the first event and
treat a null job ID as pending rather than missing metadata.

**Disconnect semantics:** Every connection cycles after 60 seconds. If the initial connection ends
before response-event subscription acquisition completes, the pending row is marked failed so it
does not consume a concurrency slot indefinitely. After subscription acquisition, cycle expiry or
disconnect only detaches the subscriber and emits no timeout event. Reconnect via `GET .../stream`
to reattach. Cancel explicitly via `DELETE`.

## Performance

| Endpoint                               | Round Trips | Caching | Notes                                                                     |
| -------------------------------------- | ----------- | ------- | ------------------------------------------------------------------------- |
| POST /api/v1/agent-responses           | 5+          | None    | Auth + API safety provider call + quota(2) + insert + subscribe + enqueue |
| GET /api/v1/agent-responses/:id        | 2           | None    | Auth + fetch                                                              |
| GET /api/v1/agent-responses/:id/stream | 2           | None    | Auth + fetch + subscribe                                                  |
| DELETE /api/v1/agent-responses/:id     | 3           | None    | Auth + fetch + cancel signal                                              |

## Related

- Service: [Agent Responses service](../../../services/agent-responses/)
- Worker: [ai-agents worker](../../../workers/ai-agents/)
- Parent: [API CLAUDE](../../CLAUDE.md)
