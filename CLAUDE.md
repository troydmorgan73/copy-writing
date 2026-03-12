# RA Product Audit

## Purpose
Daily automated audit of all RA Cycles product descriptions, SEO titles, and meta descriptions.
Fetches ~4,000 products from Shopify GraphQL, grades each against a 4-tier system, and writes results to Google Sheets.

## Architecture
- **Framework:** Next.js 15 (App Router) on Vercel
- **Runtime:** Serverless function (Node.js), max 300s duration (requires Vercel Pro)
- **Trigger:** Vercel Cron at 6:00 AM UTC daily (`vercel.json`)
- **Data flow:** Shopify GraphQL → audit logic → Google Sheets API

### Key Files
| File | Purpose |
|------|---------|
| `app/api/audit/route.ts` | Cron endpoint — orchestrates fetch → grade → write |
| `lib/shopify.ts` | Shopify GraphQL client with pagination and throttle handling |
| `lib/auditor.ts` | Grading engine — content rating, SEO title score, meta desc score |
| `lib/tier-mapping.ts` | Product type → tier map (417 types across 4 tiers) |
| `lib/sheets.ts` | Google Sheets writer — Full Audit, Cleanup Queue, Summary tabs |

### Google Sheet Tabs
1. **Full Audit** — Every product with all scores, sorted worst-first
2. **Cleanup Queue** — Only products below "Good", for Jack to work through
3. **Summary** — Roll-up stats by tier and rating

### Rating System
- **Good** — Meets word count target AND has required structural elements
- **Light** — Has words but missing structure, OR slightly below target
- **Thin** — Well below word count minimum
- **Missing** — No description at all

### Tier System
| Tier | Products | Word Target | Required H3s |
|------|----------|-------------|-------------|
| T1 | Bikes, Wheels | 700-1000 | 3+ |
| T2 | Apparel, Shoes, Helmets, Groupsets | 400-600 | 2+ |
| T3 | Components, Mid-level parts | 200-400 | 1+ |
| T4 | Small accessories, Tools, Consumables | 50-200 | 0 |

## Environment Variables
- `SHOPIFY_ACCESS_TOKEN` — Shopify Admin API token
- `SHOPIFY_SHOP_NAME` — Store name (without .myshopify.com)
- `SHOPIFY_API_VERSION` — API version (default: 2025-10)
- `GOOGLE_SERVICE_ACCOUNT_KEY` — Base64-encoded Google service account JSON
- `GOOGLE_SHEET_ID` — Target Google Sheet ID
- `CRON_SECRET` — Vercel cron authentication secret

## Current Status
Initial scaffold — not yet deployed or tested.

## Conventions
- TypeScript throughout
- No external state (stateless per invocation)
- All Shopify calls go through `shopify_graphql_throttled` pattern
- Sheets are fully rewritten each run (no append)
