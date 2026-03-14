# RA Cycles — Copy Writing

## Purpose
Two-part system for managing product descriptions across ~8,900 products on the RA Cycles Shopify store:
1. **Daily Audit** — Grades every product's description, SEO title, and meta description against a tier-based quality standard. Writes results to Google Sheets and sends a Slack summary.
2. **Push Description** — API endpoint that accepts a product description, SEO metadata, and pushes it directly to Shopify. Also marks the product's `custom.product_description_needs` metafield as "Complete".

## Architecture
- **Framework:** Next.js 15 (App Router) on Vercel
- **Runtime:** Serverless functions (Node.js), max 300s for audit, 30s for push
- **Deployment:** Vercel Git integration — push to `main` triggers deploy
- **Production URL:** `copy-writing-rouge.vercel.app`
- **Repo:** `troydmorgan73/copy-writing` on GitHub

### Key Files
| File | Purpose |
|------|---------|
| `app/api/audit/route.ts` | Cron endpoint — fetches all products → grades → writes to Sheets → Slack notification |
| `app/api/push-description/route.ts` | POST endpoint — pushes description HTML, SEO title, meta desc, and metafield to Shopify |
| `lib/shopify.ts` | Shopify GraphQL client with pagination and throttle/retry handling |
| `lib/auditor.ts` | Grading engine — content rating, SEO title score, meta description score |
| `lib/tier-mapping.ts` | Product type → tier map (417+ types across 4 tiers) |
| `lib/sheets.ts` | Google Sheets writer — Full Audit, Cleanup Queue, Summary tabs (23 columns including Shopify Product ID) |
| `google-apps-script.js` | Reference copy of Troy's Google Apps Script that reads the sheet and generates Compiled Info blocks |
| `push_to_shopify.py` | Standalone Python push script (fallback for local use in VS Code) |
| `vercel.json` | Cron config — audit runs daily at 6:00 AM UTC |

### API Endpoints

**GET /api/audit** (Cron)
- Fetches all ~8,900 products via Shopify GraphQL (paginated, throttle-aware)
- Grades each product against tier-specific word count and structural requirements
- Writes three tabs to Google Sheets: Full Audit, Cleanup Queue, Summary
- Sends a Slack notification with roll-up stats
- Auth: Vercel Cron (`CRON_SECRET` via `Authorization: Bearer`)
- Duration: ~3-4 minutes for full catalog

**POST /api/push-description**
- Accepts JSON body: `{ productId, html, seoTitle?, metaDesc? }`
- Updates the Shopify product's `descriptionHtml` and SEO fields via `productUpdate` mutation
- Sets `custom.product_description_needs` metafield to "Complete" via `metafieldsSet` mutation
- Auth: `CRON_SECRET` via `Authorization: Bearer`
- Duration: <5 seconds

### Google Sheet Structure
The audit writes to a Google Sheet with 23 columns (A-W):
- Product metadata (title, handle, vendor, type, price, status, URL)
- Audit scores (content rating, SEO title rating, meta desc rating, word count)
- Tier info and word targets
- Vendor URL and Shopify Product ID (column W — the full GID like `gid://shopify/Product/XXXXX`)

Troy has a Google Apps Script (`compileSeoInfo()`) that reads the sheet and generates a "Compiled Info" block for each product — this is what gets pasted into Claude to trigger the `product-descriptions` skill (installed globally at `~/.claude/skills/product-descriptions/`).

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
All set in Vercel project settings:
- `SHOPIFY_ACCESS_TOKEN` — Shopify Admin API token
- `SHOPIFY_SHOP_NAME` — Store name (with or without .myshopify.com — code strips the suffix)
- `SHOPIFY_API_VERSION` — API version (default: 2025-10)
- `GOOGLE_SERVICE_ACCOUNT_KEY` — Base64-encoded Google service account JSON
- `GOOGLE_SHEET_ID` — Target Google Sheet ID
- `CRON_SECRET` — Vercel cron and API authentication secret
- `RA_TROY_NOTIFY_SLACK_WEBHOOK_URL` — Slack incoming webhook for audit notifications

Local development uses `.env.local` with the same keys.

## Workflow: Writing Product Descriptions
1. Daily audit runs and populates the Google Sheet
2. Troy's Apps Script generates a Compiled Info block for a product (includes Shopify Product ID from column W)
3. Troy pastes the Compiled Info into Claude (triggers the global `product-descriptions` skill at `~/.claude/skills/product-descriptions/`)
4. Claude researches the product, writes a T1-T4 description, generates SEO title + meta
5. Troy reviews and says "push it"
6. Claude navigates Chrome to `https://copy-writing-rouge.vercel.app` and uses same-origin `fetch('/api/push-description', ...)` to POST the description, SEO fields, and product ID
7. The endpoint pushes to Shopify and sets `custom.product_description_needs` metafield to "Complete"

## Current Status
Deployed and running in production. Daily audit cron executes at 6 AM UTC. Push endpoint is deployed and ready for use.

## Conventions
- TypeScript throughout (except the standalone Python push script)
- No external state — stateless per invocation
- All Shopify calls go through the `shopifyGraphQL` function with automatic throttle/retry
- Sheets are fully rewritten each audit run (no append)
- Push endpoint is idempotent — safe to call multiple times for the same product
