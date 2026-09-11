# Asides reference

[Back to Asides](ASIDES.md)

## Page-to-Aside Mapping

### Discovery Pages

Routes: `/`, `/news`

Each page uses `<PageWithAside aside={<DiscoveryAsides />}>`:

| Order | Type   | Aside                        | Auth            | Notes                       |
| ----- | ------ | ---------------------------- | --------------- | --------------------------- |
| 1     | static | AboutVouchaAside (accordion) | any             |                             |
| 2     | RSC    | TrendingTopicsAside          | any             |                             |
| 3     | RSC    | ContributeCtaAside           | logged-in       |                             |
| 4     | RSC    | CreateFirstPostAside         | logged-in       | dismissible, activity-gated |
| 5     | RSC    | CreateLandingPageAside       | logged-in       | dismissible, activity-gated |
| 6     | RSC    | UpgradeMembershipAside       | logged-in, free | dismissible                 |

### Post Listing Pages

Routes: `/posts`, `/reviews`, `/discussions`, `/data-points`, `/articles`

Set via `web/app/(posts)/layout.tsx`:

| Order | Type   | Aside                        | Auth            | Notes       |
| ----- | ------ | ---------------------------- | --------------- | ----------- |
| 1     | static | AboutVouchaAside (accordion) | any             |             |
| 2     | RSC    | TrendingTopicsAside          | any             |             |
| 3     | RSC    | ContributeCtaAside           | logged-in       |             |
| 4     | RSC    | UpgradeMembershipAside       | logged-in, free | dismissible |

### Post Detail Pages

Routes: `/:postType/:id` (e.g., `/discussions/123`)

Set via `web/app/(topics)/[topicType]/[id]/post-detail-aside.tsx`:

| Order | Type   | Aside                        | Auth      | Notes                                              |
| ----- | ------ | ---------------------------- | --------- | -------------------------------------------------- |
| 1     | static | Post Author Card             | any       | if post has author                                 |
| 2     | RSC    | PostFollowContext            | any       |                                                    |
| 3     | RSC    | PostReviewReferralLinksAside | any       | review posts only, when topic has referral program |
| 4     | RSC    | PostRelatedTopicsAside       | any       | renders as "Categories" (category topics)          |
| 5     | RSC    | PostRelatedPostsAside        | any       |                                                    |
| 6     | RSC    | PostRelatedUrlsAside         | any       | renders as "Related Links" (related URLs)          |
| 7     | RSC    | ContributeCtaAside           | logged-in |                                                    |

### Topic List Pages

Routes: `/topics`, `/cards`, `/rewards-programs`, `/referral-programs`, `/spending-categories`, `/sources`, `/domains`

Set via `web/app/(topics)/layout.tsx`:

| Order | Type   | Aside                        | Auth      | Notes       |
| ----- | ------ | ---------------------------- | --------- | ----------- |
| 1     | static | AboutVouchaAside (accordion) | any       |             |
| 2     | RSC    | FollowTopicsAside            | logged-in | dismissible |
| 3     | RSC    | TrendingTopicsAside          | any       |             |

### Topic Detail Pages

Routes: `/:topicType/:id/*` (e.g., `/cards/123`)

Set via `web/components/topics/topic-route-layout.tsx`:

| Order | Type   | Aside                   | Auth       | Notes                                                                                     |
| ----- | ------ | ----------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| 1     | static | TopicDescriptionAside   | any        | merged "About" card: html description + "Updated on … by …" line; hidden when both absent |
| 2     | static | ReferralCtaAside        | logged-out | param-dependent                                                                           |
| 3     | static | TopicSourcesAside       | any        | RSS feeds + domains                                                                       |
| 4     | static | TopicActionsAside       | any        | RSS feed link always visible; Mute/Contribute gated to logged-in; dynamic import          |
| 5     | RSC    | TopicRelatedTopicsAside | any        |                                                                                           |
| 6     | RSC    | TopicCommunitiesAside   | any        | auth-gated streaming; empty=null                                                          |
| 7     | RSC    | TopicFaqPostsAside      | any        | accordion                                                                                 |
| 8     | RSC    | ReferralLinksAside      | any        | conditional on topic                                                                      |
| 9     | RSC    | TopicAdminAside         | admin      | dynamic import                                                                            |

### Feed Pages

Routes: `/feed/posts/*`, `/feed/news/*`

Set via `web/app/feed/layout.tsx`:

| Order | Type | Aside                    | Auth            | Notes                       |
| ----- | ---- | ------------------------ | --------------- | --------------------------- |
| 1     | RSC  | FollowTopicsAside        | logged-in       | dismissible, activity-gated |
| 2     | RSC  | FindPeopleAside          | logged-in       | dismissible, activity-gated |
| 3     | RSC  | ConnectSocialAside       | logged-in       | dismissible                 |
| 4     | RSC  | DiscoverCommunitiesAside | logged-in       | activity-gated              |
| 5     | RSC  | UpgradeMembershipAside   | logged-in, free | dismissible                 |

### User Profile Pages

Routes: `/user/:username/*`

Set via `web/components/users/user-detail-layout.tsx`:

| Order | Type   | Aside                               | Auth                | Notes                                                                                                           |
| ----- | ------ | ----------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1     | static | ShareLandingPageBanner              | owner               | clipboard share; client component                                                                               |
| 2     | static | UserActionsAside                    | logged-in, not self | mute + block buttons; dynamic import                                                                            |
| 3     | static | UserVouchElectionCard               | logged-in, not self | dynamic import; Vouch/Like/Neutral/Dislike/Disavow; only Disavow auto-mutes + auto-unfollows; counts admin-only |
| 4     | RSC    | UserVouchFollowContext              | logged-in, not self | "From People You Follow" friend signal split into positive / negative                                           |
| 5     | RSC    | UserTagsAside                       | logged-in, not self | net-positive tags with inline voting; Manage modal includes every allowed tag                                   |
| 6     | RSC    | PopularCommunitiesAside (accordion) | any                 |                                                                                                                 |

### Settings Pages

Routes: `/my/*` (profile, preferences, api-keys, etc.)

Set via `web/app/(my)/layout.tsx`, `showFooter={false}`:

| Order | Type   | Aside                        | Auth            | Notes       |
| ----- | ------ | ---------------------------- | --------------- | ----------- |
| 1     | static | AboutVouchaAside (accordion) | any             |             |
| 2     | RSC    | ConnectSocialAside           | logged-in       | dismissible |
| 3     | RSC    | UpgradeMembershipAside       | logged-in, free | dismissible |

### Community List

Routes: `/communities`, `showFooter={false}`

Set in page component:

| Order | Type   | Aside                        | Auth | Notes |
| ----- | ------ | ---------------------------- | ---- | ----- |
| 1     | static | AboutVouchaAside (accordion) | any  |       |
| 2     | RSC    | PopularCommunitiesAside      | any  |       |

### Community Detail

Routes: `/communities/:slug/*`

Already has community about card. No RSC asides.

### Chat Pages

Routes: `/chat/*`, `showFooter={false}`

Set via `web/app/(chat)/layout.tsx`:

| Order | Type | Aside                               | Auth | Notes |
| ----- | ---- | ----------------------------------- | ---- | ----- |
| 1     | RSC  | PopularCommunitiesAside (accordion) | any  |       |

### Admin/Growth Pages

Routes: `/admin/*`, `/growth`

No asides — just `AsideFooter` (when applicable).

### Marketing Pages

Routes: `/plans`, `showFooter={false}`

Set in page component:

| Order | Type   | Aside                        | Auth | Notes |
| ----- | ------ | ---------------------------- | ---- | ----- |
| 1     | static | AboutVouchaAside (accordion) | any  |       |

### Post Creation Pages

Routes: `/discussions/create`, `/reviews/create`, `/data-points/create`, `/articles/create`, `/blog-posts/create`

These routes use the `(posts)` layout which sets `showFooter={false}` when the pathname ends with `/create`. No custom asides — aside footer is hidden.
