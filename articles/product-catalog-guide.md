---
title: 'How Product Comparisons Work on Voucha'
slug: product-catalog-guide
post_type: article
topics:
  - voucha
---

# How Product Comparisons Work on Voucha

When you're researching a GPU or a pair of headphones, you're usually comparing across two things at once: which product is right for you, and where to buy it. Most sites handle one or the other. Voucha connects them — product identity, community data, and real prices in one place.

Here's how the structure works.

## Three Levels of Product Data

### Product Families

A product family is a product line — a named product that exists across multiple configurations. "iPhone 15," "Sony WH-1000XM5," "NVIDIA RTX 4090" are product families. Each family belongs to a brand and has a spec schema that defines what fields are relevant for that product line.

Product families are what you follow, bookmark, and search for. When you're comparing headphones, you're comparing families. When you look up community reviews, you start here.

### Product Variants

A variant is a specific, purchasable configuration of a product family. "iPhone 15 Pro 256GB Space Black" and "iPhone 15 Pro 512GB Natural Titanium" are different variants of the same family. Each variant has:

- A manufacturer part number (MPN) and GTIN for precise identification
- A spec set matching the family's schema (storage, color, capacity, etc.)
- Its own community reviews and data points

Variants matter when the purchase decision turns on configuration. For a GPU, the spec differences between variants affect real-world performance. Voucha tracks data points at the variant level, so community reliability reports on one specific configuration aren't averaged together with a different one.

### Product Listings

A listing is a variant offered by a specific retailer in a specific country. The same GPU variant might have five listings across Amazon, Newegg, Best Buy, and two regional retailers. Each listing tracks:

- Current price (in local currency)
- Availability status: in stock, out of stock, pre-order, backordered, discontinued
- Direct URL and affiliate URL to the product page
- Complete price history since the listing was created

Price history is append-only — every change to price or availability is recorded automatically. This lets you track how prices move over time, spot seasonal patterns, and see when a product has gone end-of-life.

## Community Reviews and Real Numbers

Product families and variants are topics on Voucha, which means they participate in the full review and data point system:

- **Reviews** — structured assessments with sub-ratings by dimension
- **Data points** — specific factual reports (failure date, purchase price, real-world performance measurements)

When community members submit failure data on a GPU or reliability data on an appliance, those data points aggregate into something you can act on. "43% failure rate within 2 years from the RTX 3080 LHR variant, based on 89 community reports" is different from reading individual reviews — it's a number with a sample size attached.

Trust weighting applies here too. Data points from high-trust contributors — people whose historical submissions have been accurate and consistent with community consensus — carry more weight in aggregate calculations than data points from new or low-trust accounts.

## Retailer Data

Retailers are also topics in Voucha's structure. Amazon, Best Buy, and Newegg have profiles, community trust scores, and associated listings. That means:

- Community members can review and rate retailers, not just products
- A retailer's domain trust score factors into how prominently their listings surface
- Price comparisons across retailers are built into the product listing model

Retailer listings include affiliate URLs where applicable. When a community member's referral link leads you to a product listing, the trust system ensures you're seeing links from contributors with actual credibility — not just whoever has the biggest affiliate commission deal.

## Across Every Category

The same product catalog structure applies across every Voucha vertical. Credit cards, GPUs, appliances, AI tools, and EV batteries all live in the same topic graph. That means:

- A user trusted for GPU reliability reports and a user trusted for credit card data points share the same underlying trust system
- Users who research both hardware and financial products build a unified trust profile
- Topic relationships across categories (a GPU brand's track record affects how that brand's other products surface) create connections that siloed review sites can't replicate

When you're making a real decision, you want real numbers from people who've been there. That's what the product catalog is built to give you.
