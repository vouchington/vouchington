# Prompt Management

[Back to Community Moderation reference](reference-community-moderation-api-routes.md#prompt-management)

| Method   | Path                                                           | Description                           |
| -------- | -------------------------------------------------------------- | ------------------------------------- |
| `GET`    | `/api/v1/communities/:slug/agent-prompts`                      | List prompts + slot info              |
| `POST`   | `/api/v1/communities/:slug/agent-prompts`                      | Create a new prompt                   |
| `GET`    | `/api/v1/communities/:slug/agent-prompts/:promptId`            | Get a single prompt                   |
| `PATCH`  | `/api/v1/communities/:slug/agent-prompts/:promptId`            | Update prompt text                    |
| `DELETE` | `/api/v1/communities/:slug/agent-prompts/:promptId`            | Soft-delete a prompt                  |
| `POST`   | `/api/v1/communities/:slug/agent-prompts/:promptId/allocate`   | Activate (consume a slot)             |
| `POST`   | `/api/v1/communities/:slug/agent-prompts/:promptId/deallocate` | Deactivate (free the slot)            |
| `POST`   | `/api/v1/communities/:slug/agent-prompts/:promptId/test`       | Dry-run against sample text           |
| `POST`   | `/api/v1/communities/:slug/automod/simulate`                   | Dry-run against recent approved posts |
