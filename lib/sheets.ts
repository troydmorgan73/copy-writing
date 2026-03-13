/**
 * Google Sheets writer — writes audit results to a single "SEO Improvement" tab.
 * The existing tabs in the sheet are left untouched.
 *
 * Every active product is listed, sorted worst-first by content rating,
 * so Jack can work top-down through the list.
 */

import { google } from "googleapis";
import { type ProductAudit, type ContentRating } from "./auditor";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// Tab name — created automatically if it doesn't exist
const TAB_NAME = "SEO Improvement";

// ── Auth ──

function getAuthClient() {
  const key = JSON.parse(process.env.RA_AUTOMATIONS_GOOGLE_KEY!);

  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: "v4", auth });
}

// ── Sheet helpers ──

async function ensureTab(sheets: ReturnType<typeof getSheetsClient>, tabName: string) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = spreadsheet.data.sheets?.some(
    (s) => s.properties?.title === tabName
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: tabName },
            },
          },
        ],
      },
    });
    console.log(`  [sheets] Created tab: ${tabName}`);
  }
}

async function clearAndWrite(
  sheets: ReturnType<typeof getSheetsClient>,
  tabName: string,
  rows: (string | number | boolean)[][]
) {
  // Clear existing content
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'!A:Z`,
  });

  // Write new data
  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });
  }

  console.log(`  [sheets] Wrote ${rows.length} rows to ${tabName}`);
}

// ── Rating sort order (worst first) ──

const RATING_ORDER: Record<ContentRating, number> = {
  Missing: 0,
  Thin: 1,
  Light: 2,
  Good: 3,
};

// ── Main writer ──

export interface AuditSummary {
  good: number;
  light: number;
  thin: number;
  missing: number;
  excluded: number;
  total: number;
}

export async function writeAuditToSheets(
  audits: ProductAudit[],
  summary: AuditSummary
): Promise<void> {
  const sheets = getSheetsClient();

  await ensureTab(sheets, TAB_NAME);

  const auditDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Sort by priority score descending (highest priority first)
  // Within same score: tier ascending (T1 first), then price descending
  const sorted = [...audits].sort((a, b) => {
    const priorityDiff = b.priorityScore - a.priorityScore;
    if (priorityDiff !== 0) return priorityDiff;
    const tierDiff = a.contentTier - b.contentTier;
    if (tierDiff !== 0) return tierDiff;
    return b.priceNum - a.priceNum;
  });

  // Use just the store name (strip .myshopify.com if present) for admin URLs
  const storeName = (process.env.SHOPIFY_SHOP_NAME || "").replace(/\.myshopify\.com$/, "");

  const rows: (string | number)[][] = [
    // Header row — Compiled Info (col A) + Priority (col B) color-coded by Apps Script
    [
      "Compiled Info",
      "Priority",
      "Product Title",
      "Vendor",
      "Product Type",
      "Tier",
      "Word Count",
      "Content Rating",
      "Content Issues",
      "H3 Count",
      "Bold Name",
      "SEO Title Score",
      "SEO Title Issues",
      "Current SEO Title",
      "Meta Desc Score",
      "Meta Desc Issues",
      "Current Meta Desc",
      "Product URL",
      "Shopify Admin",
      "Manufacturer URL",
      "Price",
      "Audit Date",
    ],
    // Data rows — column A filled by Apps Script, column B written here (colored by Apps Script)
    ...sorted.map((a) => [
      "",  // Compiled Info — populated by Apps Script
      a.priorityLabel,
      a.title,
      a.vendor,
      a.productType,
      `T${a.contentTier}`,
      a.wordCount,
      a.contentRating,
      a.contentIssues.join("; "),
      a.h3Count,
      a.hasBoldProductName ? "Yes" : "No",
      a.seoTitleScore,
      a.seoTitleIssues.join("; "),
      a.currentSeoTitle,
      a.metaDescScore,
      a.metaDescIssues.join("; "),
      a.currentMetaDesc,
      a.productUrl,
      `https://admin.shopify.com/store/${storeName}/products/${a.id.split("/").pop()}`,
      a.vendorUrl,
      a.price,
      auditDate,
    ]),
  ];

  await clearAndWrite(sheets, TAB_NAME, rows);

  console.log(`  [sheets] Audit complete: ${summary.total} total, ${audits.length} audited, ${summary.excluded} excluded`);
  console.log(`  [sheets] Ratings: ${summary.good} Good, ${summary.light} Light, ${summary.thin} Thin, ${summary.missing} Missing`);
}
