# Navigation reference

[Back to Navigation](NAVIGATION.md)

## Intent Taxonomy

### Product Intents (visible to all users unless noted)

| id               | Label           | Auth required | Icon           |
| ---------------- | --------------- | ------------- | -------------- |
| `news`           | News            | No            | Newspaper      |
| `podcasts`       | Podcasts        | No            | Headphones     |
| `videos`         | Videos          | No            | Play           |
| `posts`          | Posts           | No            | FileText       |
| `topics`         | Topics          | No            | Layers         |
| `referral-links` | Referral Links  | No            | Gift           |
| `web-search`     | Web Search      | No            | Globe          |
| `chat`           | Chat            | Yes           | MessageSquare  |
| `messages`       | Messages        | Yes           | Bell           |
| `landing-pages`  | Landing Pages   | Yes           | LayoutTemplate |
| `communities`    | Communities     | No            | Users          |
| `friends`        | Users & Friends | Yes           | UserPlus       |

### Admin Intents (`moderation` requires auth only; others require `administrator` role, except Growth which also allows `investor`)

| id            | Label       | Icon        |
| ------------- | ----------- | ----------- |
| `moderation`  | Moderation  | ShieldAlert |
| `crm`         | CRM         | Contact     |
| `engineering` | Engineering | Settings2   |
| `growth`      | Growth      | TrendingUp  |
