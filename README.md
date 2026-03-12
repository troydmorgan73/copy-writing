# RA Product Audit

Daily automated audit of RA Cycles product descriptions, SEO titles, and meta descriptions. Runs on Vercel as a cron job, grades ~4,000 products from Shopify, and writes results to Google Sheets.

## Setup

### 1. Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use existing)
3. Enable the **Google Sheets API**
4. Create a **Service Account** under IAM → Service Accounts
5. Create a JSON key for the service account
6. Share the target Google Sheet with the service account email (Editor access)
7. Base64-encode the JSON key: `base64 -i service-account-key.json | tr -d '\n'`

### 2. Environment Variables

Set these in Vercel project settings (Settings → Environment Variables):

| Variable | Value |
|----------|-------|
| `SHOPIFY_ACCESS_TOKEN` | Your Shopify Admin API token |
| `SHOPIFY_SHOP_NAME` | Store name (e.g., `racycles`) |
| `SHOPIFY_API_VERSION` | `2025-10` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Base64-encoded service account JSON |
| `GOOGLE_SHEET_ID` | `1HWLP8TF8B45rC3fi0zQ982ZcKhPcjmZdiksR9oWcisY` |
| `CRON_SECRET` | A random string for cron auth |

### 3. Deploy

```bash
npm install
vercel --prod
```

### 4. Verify

The cron runs daily at 6:00 AM UTC. To test manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/audit
```

## Requirements

- **Vercel Pro plan** — Free plan has a 10s function timeout; this needs ~3-4 minutes for 4,000+ products.
- **Shopify Admin API access** — Read access to products.
- **Google Sheets API** — Service account with Editor access to the sheet.
