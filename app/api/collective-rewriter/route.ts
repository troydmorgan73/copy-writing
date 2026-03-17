/**
 * GET /api/collective-rewriter — Auto-rewrite Shopify Collective product descriptions
 *
 * Fetches draft products tagged "Shopify Collective", rewrites their descriptions
 * using Claude API, pushes the rewritten copy to Shopify, sets status to ACTIVE,
 * and logs results to Google Sheets.
 *
 * Processes up to 10 products per run to stay within Vercel's 300s timeout.
 * Runs daily at 6:30 AM UTC (after product and collection audits).
 *
 * Auth: CRON_SECRET via Bearer token or Vercel cron header.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";

export const maxDuration = 300;

// ── Config ──

const MAX_PRODUCTS_PER_RUN = 10;
const COLLECTIVE_TAB = "Shopify Collective Products";
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

const RAW_STORE = process.env.SHOPIFY_SHOP_NAME || "";
const SHOPIFY_STORE = RAW_STORE.replace(/\.myshopify\.com$/, "");
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";
const GRAPHQL_URL = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;

// ── Auth ──

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel cron sends this header
  if (req.headers.get("x-vercel-cron") === secret) return true;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

// ── Shopify GraphQL ──

async function shopifyGraphQL(query: string, variables: Record<string, unknown> = {}) {
  const resp = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Shopify HTTP ${resp.status}: ${text}`);
  }

  return resp.json();
}

// ── Fetch draft Collective products ──

const FETCH_COLLECTIVE_PRODUCTS = `
  query($first: Int!, $cursor: String) {
    products(first: $first, after: $cursor, sortKey: TITLE, query: "status:draft tag:'Shopify Collective'") {
      edges {
        cursor
        node {
          id
          title
          handle
          vendor
          productType
          descriptionHtml
          priceRangeV2 {
            maxVariantPrice {
              amount
            }
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

interface CollectiveProduct {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  descriptionHtml: string;
  price: string;
}

async function fetchCollectiveProducts(): Promise<CollectiveProduct[]> {
  const products: CollectiveProduct[] = [];
  let cursor: string | null = null;

  // Fetch up to 250 at a time (we'll only process MAX_PRODUCTS_PER_RUN)
  for (let page = 0; page < 5; page++) {
    const variables: Record<string, unknown> = { first: 50 };
    if (cursor) variables.cursor = cursor;

    const result = await shopifyGraphQL(FETCH_COLLECTIVE_PRODUCTS, variables);
    const edges = result.data?.products?.edges || [];

    for (const edge of edges) {
      const node = edge.node;
      products.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        vendor: node.vendor,
        productType: node.productType,
        descriptionHtml: node.descriptionHtml || "",
        price: node.priceRangeV2?.maxVariantPrice?.amount || "0",
      });
    }

    if (!result.data?.products?.pageInfo?.hasNextPage) break;
    cursor = edges[edges.length - 1].cursor;
  }

  return products;
}

// ── Claude API — Rewrite description ──

const SYSTEM_PROMPT = `You are a product copywriter for RA Cycles, a premium cycling retailer in New York City.

Your job is to rewrite product descriptions that come from third-party suppliers (Shopify Collective). The supplier descriptions are often generic, poorly formatted, or don't match RA Cycles' voice.

Rules:
1. Keep it concise — 100-300 words depending on product complexity
2. Use clean, semantic HTML: <p> paragraphs, <h3> subheadings where appropriate, <ul>/<li> for spec lists
3. Lead with what the product IS and who it's for
4. Highlight key features and specs from the original description — don't invent new ones
5. Use RA Cycles' voice: knowledgeable, direct, enthusiast-friendly, no fluff or hype
6. Do NOT include the product name as an H1/H2 (Shopify handles that)
7. Do NOT include pricing
8. If the original description is empty or useless, write a brief 2-3 sentence description based on the product name, vendor, and type
9. Return ONLY the HTML — no markdown, no explanation, no preamble

Example output format:
<p>Opening paragraph about the product.</p>
<h3>Key Features</h3>
<ul>
<li>Feature one</li>
<li>Feature two</li>
</ul>
<p>Closing paragraph.</p>`;

async function rewriteDescription(product: CollectiveProduct): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey: anthropicKey });

  const userPrompt = `Rewrite this product description for RA Cycles:

Product: ${product.title}
Brand: ${product.vendor}
Type: ${product.productType}
Price: $${parseFloat(product.price).toFixed(2)}

Current description:
${product.descriptionHtml || "(no description provided)"}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? (textBlock as { type: "text"; text: string }).text : "";
}

// ── Push rewritten description + activate ──

const UPDATE_AND_ACTIVATE = `
  mutation($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        handle
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SET_METAFIELD = `
  mutation($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

async function pushAndActivate(
  product: CollectiveProduct,
  newHtml: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate SEO title and meta description
    const seoTitle = `${product.title} | RA Cycles`;
    const metaDesc = generateMetaDesc(product.title, product.vendor, product.productType);

    const result = await shopifyGraphQL(UPDATE_AND_ACTIVATE, {
      input: {
        id: product.id,
        descriptionHtml: newHtml,
        status: "ACTIVE",
        seo: {
          title: seoTitle.length <= 70 ? seoTitle : `${product.title}`,
          description: metaDesc,
        },
      },
    });

    const userErrors = result.data?.productUpdate?.userErrors || [];
    if (userErrors.length > 0) {
      return { success: false, error: userErrors.map((e: { message: string }) => e.message).join("; ") };
    }

    // Set metafield to mark as complete
    await shopifyGraphQL(SET_METAFIELD, {
      metafields: [
        {
          ownerId: product.id,
          namespace: "custom",
          key: "product_description_needs",
          type: "single_line_text_field",
          value: "Complete",
        },
      ],
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function generateMetaDesc(title: string, vendor: string, productType: string): string {
  const desc = `Shop the ${title} by ${vendor} at RA Cycles. Premium ${productType.toLowerCase()} with expert support and fast shipping from NYC.`;
  return desc.length <= 160 ? desc : desc.substring(0, 157) + "...";
}

// ── Google Sheets logging ──

function getSheetsClient() {
  const key = JSON.parse(process.env.RA_AUTOMATIONS_GOOGLE_KEY!);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureCollectiveTab(sheets: ReturnType<typeof getSheetsClient>) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = spreadsheet.data.sheets?.some(
    (s) => s.properties?.title === COLLECTIVE_TAB
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: COLLECTIVE_TAB } } }],
      },
    });
    console.log(`[collective] Created tab: ${COLLECTIVE_TAB}`);
  }
}

interface RewriteResult {
  product: CollectiveProduct;
  newHtml: string;
  pushResult: { success: boolean; error?: string };
  timestamp: string;
}

async function logToSheets(results: RewriteResult[]) {
  const sheets = getSheetsClient();
  await ensureCollectiveTab(sheets);

  // Read existing data to append (don't overwrite — this is a log)
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${COLLECTIVE_TAB}'!A:A`,
  });

  const existingRows = existing.data.values?.length || 0;

  // If empty, write header first
  if (existingRows === 0) {
    const header = [
      "Date",
      "Product Title",
      "Vendor",
      "Product Type",
      "Price",
      "Status",
      "Error",
      "Shopify Admin",
      "Shopify Product ID",
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${COLLECTIVE_TAB}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [header] },
    });
  }

  // Append results
  const rows = results.map((r) => {
    const numericId = r.product.id.split("/").pop();
    return [
      r.timestamp,
      r.product.title,
      r.product.vendor,
      r.product.productType,
      `$${parseFloat(r.product.price).toFixed(2)}`,
      r.pushResult.success ? "Rewritten + Activated" : "Failed",
      r.pushResult.error || "",
      `https://admin.shopify.com/store/${SHOPIFY_STORE}/products/${numericId}`,
      r.product.id,
    ];
  });

  const startRow = Math.max(existingRows, 1) + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${COLLECTIVE_TAB}'!A${startRow}`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  console.log(`[collective] Logged ${rows.length} results to "${COLLECTIVE_TAB}" tab`);
}

// ── Slack notification ──

async function notifySlack(results: RewriteResult[], remaining: number) {
  const webhook = process.env.RA_TROY_NOTIFY_SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const succeeded = results.filter((r) => r.pushResult.success).length;
  const failed = results.filter((r) => !r.pushResult.success).length;

  const lines = [
    `*Shopify Collective Rewriter* — ${succeeded} rewritten, ${failed} failed, ${remaining} remaining`,
  ];

  if (succeeded > 0) {
    lines.push("✅ *Rewritten & Activated:*");
    results
      .filter((r) => r.pushResult.success)
      .forEach((r) => lines.push(`  • ${r.product.title} (${r.product.vendor})`));
  }

  if (failed > 0) {
    lines.push("❌ *Failed:*");
    results
      .filter((r) => !r.pushResult.success)
      .forEach((r) => lines.push(`  • ${r.product.title}: ${r.pushResult.error}`));
  }

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
  } catch (err) {
    console.error("[collective] Slack notification failed:", err);
  }
}

// ── Main handler ──

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SHOPIFY_TOKEN || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Missing required env vars (SHOPIFY_ACCESS_TOKEN, ANTHROPIC_API_KEY)" },
      { status: 500 }
    );
  }

  try {
    console.log("[collective] Fetching draft Collective products...");
    const allProducts = await fetchCollectiveProducts();
    console.log(`[collective] Found ${allProducts.length} draft Collective products`);

    if (allProducts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No draft Collective products found",
        processed: 0,
        remaining: 0,
      });
    }

    // Process up to MAX_PRODUCTS_PER_RUN
    const batch = allProducts.slice(0, MAX_PRODUCTS_PER_RUN);
    const remaining = allProducts.length - batch.length;
    const results: RewriteResult[] = [];
    const timestamp = new Date().toISOString().split("T")[0];

    for (const product of batch) {
      console.log(`[collective] Rewriting: ${product.title}`);

      try {
        const newHtml = await rewriteDescription(product);
        const pushResult = await pushAndActivate(product, newHtml);

        results.push({ product, newHtml, pushResult, timestamp });

        console.log(
          `[collective] ${product.title}: ${pushResult.success ? "✅" : "❌ " + pushResult.error}`
        );
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[collective] Error processing ${product.title}:`, error);
        results.push({
          product,
          newHtml: "",
          pushResult: { success: false, error },
          timestamp,
        });
      }

      // Small delay between API calls to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Log to Google Sheets
    await logToSheets(results);

    // Slack notification
    await notifySlack(results, remaining);

    const succeeded = results.filter((r) => r.pushResult.success).length;
    const failed = results.filter((r) => !r.pushResult.success).length;

    return NextResponse.json({
      success: true,
      processed: batch.length,
      succeeded,
      failed,
      remaining,
      results: results.map((r) => ({
        title: r.product.title,
        vendor: r.product.vendor,
        success: r.pushResult.success,
        error: r.pushResult.error,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[collective] Fatal error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
