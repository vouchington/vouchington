# Entity × Action Icons

Canonical icon reference for user-facing entity actions. This page complements
[Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md), which defines where actions
appear, and [Actions](./ACTIONS.md), which defines placement and tooltip rules.

Use the semantic action icon below whenever an action is rendered with an icon,
whether the action appears inline, in a card footer, in an aside, or in a
dropdown menu. Text-only primary buttons may stay text-only; compact,
icon-bearing, and menu variants must use the canonical icon.

Implementation source: `web/components/shared/entity-action-icons.ts`.

## Action Icon Catalog

| Action family                       | Canonical Lucide icon        | Notes                                                       |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Positive trust choice               | `ArrowUp`                    | Used for Like or Vouch.                                     |
| Negative trust choice               | `ArrowDown`                  | Used for Dislike or Disavow.                                |
| Start / create discussion           | `MessageSquarePlus`          | Used when clicking creates or starts a discussion.          |
| Existing discussion / comment count | `MessageSquare`              | Used for links or counts that point to existing discussion. |
| Reply                               | `MessageSquareReply`         | Used for comment reply actions.                             |
| Quote                               | `MessageSquareQuote`         | Used for comment quote actions.                             |
| Write review                        | `PenLine`                    | Used for review contribution CTAs.                          |
| Share data point                    | `BarChart3`                  | Used for data-point contribution CTAs.                      |
| Save / Saved                        | `Bookmark` / `BookmarkCheck` | Toggle state mirrors persisted bookmark state.              |
| Hide / Mute                         | `EyeOff`                     | Both hide content from the user's feed.                     |
| Report                              | `Flag`                       | Opens the moderation report flow.                           |
| Share with followers                | `Share2`                     | Creates follower feed delivery.                             |
| Send to followers                   | `Send`                       | Sends follower notifications.                               |
| Send chat message                   | `Send`                       | Sends a chat composer message.                              |
| More actions                        | `MoreHorizontal`             | Opens an overflow menu.                                     |
| RSS feed                            | `Rss`                        | Opens an unauthenticated RSS URL.                           |
| Listen / Play                       | `Play`                       | Starts media playback.                                      |
| Follow / Join                       | `UserPlus`                   | Adds an entity/user/community relationship.                 |
| Unfollow / Leave                    | `UserMinus`                  | Removes an entity/user/community relationship.              |
| Proxy follow / Proxy mute           | `UserPlus` / `EyeOff`        | Adds community-list proxy relations.                        |
| Subscribe / Subscribed              | `BellPlus` / `BellCheck`     | Toggle state mirrors subscription state.                    |
| Block                               | `Ban`                        | Blocks a user or domain.                                    |
| Edit / Delete / Copy                | `Pencil` / `Trash2` / `Copy` | Standard lifecycle utility actions.                         |
| Dismiss notification                | `Trash2`                     | Removes a notification from the inbox.                      |
| Recommendation choice               | `ArrowUp` / `ArrowDown`      | Support or oppose a topic recommendation.                   |
| Dismiss recommendation / Withdraw   | `X` / `Undo2`                | Rejects or withdraws a topic recommendation.                |
| Create referral link                | `Link2`                      | Adds or starts sharing a referral link.                     |

## Entity × Action Matrix

| Entity                 | Actions with icons                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `rss_feed_item`        | Semantic trust choice, Hide, Save, Start discussion, Existing discussions, Share with followers, Send to followers, Report, More, Play |
| `post`                 | Semantic trust choice, Comment count, Save, Hide, Start discussion in community, Share with followers, Send to followers, Report, More |
| `comment`              | Semantic trust choice, Reply, Quote, Save, Edit, Delete, Report                                                                        |
| `topic`                | Follow, Mute, RSS feed, Write review, Share data point, Start discussion                                                               |
| `rss_feed`             | Follow, Mute, RSS feed                                                                                                                 |
| `user`                 | Follow, Subscribe posts, Mute, Block, Report                                                                                           |
| `domain`               | Semantic trust choice, Mute, Block, Report                                                                                             |
| `community`            | Join, Leave, Start discussion                                                                                                          |
| `community_list`       | Proxy follow, Proxy mute                                                                                                               |
| `topic_recommendation` | Vote, Dismiss recommendation, Withdraw                                                                                                 |
| `notification`         | Dismiss, Delete                                                                                                                        |
| `chat`                 | Send                                                                                                                                   |
| `referral_link`        | Create, Edit, Delete, Copy                                                                                                             |

## Related

- [Actions](./ACTIONS.md)
- [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md)
- [Entity × Lifecycle Flow Matrix](../ENTITY-LIFECYCLE-MATRIX.md)
- [Signed-out Actions](./SIGNED_OUT_ACTIONS.md)
- [Web rules](../../../web/CLAUDE.md)
