# Bookmark and List Write Tools

Seven MCP-only tools write the caller's own bookmarks and lists. Each runs the same shared service
command as its REST twin, so the permission, suspension, guard, and ownership rules do not fork.
They require `plan: 'plus'` and the full resource pair (`bookmarks:read` + `bookmarks:write`, or
`lists:read` + `lists:write`); a read-only grant never satisfies the write scope. The existing
per-call MCP audit records every call; there is no separate audit path. The generated
[tool catalog](catalog.md) holds each tool's description, hints, and scopes; the
[agent tools overview](README.md) covers metadata and plan gating.

| Tool                                      | REST twin                                                                           | Notes                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `set_bookmark`                            | `PUT /api/v1/bookmarks/:entityType/:entityId/:predicate`                            | `predicate` is `save`, `follow`, `mute`, or `block`; idempotent                                            |
| `remove_bookmark`                         | `DELETE /api/v1/bookmarks/:entityType/:entityId/:predicate`                         | Needs no visibility of the target; removing an unset relation changes nothing                              |
| `create_list`                             | `POST /api/v1/lists`                                                                | Every call creates a list, even when the name is taken                                                     |
| `update_list`                             | `PATCH /api/v1/lists/:id`                                                           | Omitted fields are kept; a null `description` clears it                                                    |
| `delete_list`                             | `DELETE /api/v1/lists/:id`                                                          | Soft delete; deleting a deleted list is not found                                                          |
| `add_list_item`                           | `POST /api/v1/lists/:id/items/posts`, `POST /api/v1/lists/:id/items/rss-feed-items` | `item_type` selects the route; adding an existing item returns it                                          |
| `remove_list_item`                        | `DELETE /api/v1/lists/:id/items/posts/:entityId`, `.../rss-feed-items/:entityId`    | Removing an item that is not on the list is not found                                                      |
| `POST /api/v1/lists/:id/import` (no tool) | none                                                                                | Decided against a tool: it needs community-slug resolution and is a bulk operation outside the named tools |

Follow, mute, block, and save are the `is_bookmark` predicates behind the one bookmark route
pair, so one set tool and one remove tool cover them. Muting or blocking removes the follow, as
the REST route does. The other bookmark predicates (`hide`, `subscribe`, `dismiss_recommendation`,
`proxy_follow`, `proxy_mute`) stay REST-only: the tool schema accepts only the four above and
rejects the rest as invalid arguments before any write.

The tools reject a suspended caller before any change, and list tools authorize ownership
(`404` for a missing or deleted list, `403` for another user's list) before mutating. MCP turns a
thrown error into a generic tool failure, so a caller cannot tell those two apart, and repeating a
delete or remove reports a tool error rather than success.

Private posts follow `add_entity_relation`: `set_bookmark` and `add_list_item` reach the caller's
own private post only when the credential also carries the exact
`post-relations.owned-private:write` grant (which itself requires `entity-relations:write`); another
user's private post stays hidden. `remove_bookmark` and `remove_list_item` read and disclose
nothing, so they need no private grant. `add_list_item` applies this post check to credential calls
as well as the list-ownership check, so under delegated credentials it is stricter than the REST
route, which adds a post without a visibility check.

The result schemas are owned by the tools, because the bookmark and list REST routes document their
bodies inline. `backend/tools/bookmark-list-output-schema.test.mts` pins them to the documented REST
responses.
