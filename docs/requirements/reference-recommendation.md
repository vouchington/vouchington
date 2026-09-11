# `recommendation`

[Back to Entity × Action Matrix reference](reference-entity-action-matrix-table-b-entity-action-description.md#recommendation)

Applies to `topic_recommendation`.

| Action                                                                      | Predicate                   | Description                                                                      | Endpoint                                                                | Component                                                                  |
| --------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| <a name="recommendation--vote"></a>Support / oppose                         | _(semantic recommendation)_ | Support (+1) or oppose (-1) a recommendation. Clear is a distinct DELETE action. | Election API (`PUT` choice / `DELETE` Clear)                            | `web/components/votes/score-vote.tsx`                                      |
| <a name="recommendation--dismiss-recommendation"></a>Dismiss-Recommendation | `dismiss_recommendation`    | Removes this recommendation from the user's queue permanently.                   | `PUT /api/v1/bookmarks/topic_recommendation/:id/dismiss_recommendation` | `web/components/shared/entity-bookmark-button.tsx`                         |
| <a name="recommendation--withdraw"></a>Withdraw                             | n/a                         | Author retracts their own pending recommendation.                                | `DELETE /api/v1/topic-recommendations/:id`                              | `web/components/topic-recommendations/topic-recommendations-table-row.tsx` |
