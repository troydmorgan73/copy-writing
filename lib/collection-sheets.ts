/**
 * Google Sheets writer for collection audit — writes to a "Collection Audit" tab
 * in the same Google Sheet as the product audit.
 *
 * Sorted worst-first by priority so the writer can work top-down.
 */

import { google } from "googleapis";
import { type CollectionAudit } from "./collection-auditor";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// Tab name — separate from the product audit "SEO Improvement" tab
const TAB_NAME = "Collection Audit";

// ── Auth (same service account as product audit) ──

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
    console.log(`  [collection-sheets] Created tab: ${tabName}`);
  }
}

async function clearAndWrite(
  sheets: ReturnType<typeof getSheetsClient>,
  tabName: string,
  rows: (string | number | boolean)[][]
) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `'${tabName}'!A:AD`,
  });

  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });
  }

  console.log(`  [collection-sheets] Wrote ${rows.length} rows to ${tabName}`);
}

// ── Main writer ──

export interface CollectionAuditSummary {
  good: number;
  light: number;
  thin: number;
  missing: number;
  excluded: number;
  total: number;
  brandCount: number;
  categoryCount: number;
}

export async function writeCollectionAuditToSheets(
  audits: CollectionAudit[],
  summary: CollectionAuditSummary
): Promise<void> {
  const sheets = getSheetsClient();

  await ensureTab(sheets, TAB_NAME);

  const auditDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Filter out "Low" priority (Good ratings) — they don't need attention
  const actionable = audits.filter((a) => a.priorityLabel !== "Low");

  // Sort by priority score descending (highest priority first)
  // Within same score: brand before category, then by product count
  const sorted = [...actionable].sort((a, b) => {
    const priorityDiff = b.priorityScore - a.priorityScore;
    if (priorityDiff !== 0) return priorityDiff;
    // Brand collections first within same priority
    if (a.collectionType !== b.collectionType) {
      return a.collectionType === "Brand" ? -1 : 1;
    }
    return b.productsCount - a.productsCount;
  });

  const storeName = (process.env.SHOPIFY_SHOP_NAME || "").replace(/\.myshopify\.com$/, "");

  const rows: (string | number)[][] = [
    // Header row
    [
      "Priority",           // A
      "Collection Title",   // B
      "Type",               // C — Brand or Category
      "Template",           // D — Shopify template suffix
      "Products",           // E — product count
      "Header Words",       // E
      "Header Rating",      // F
      "Header Issues",      // G
      "Paragraphs",         // H
      "Internal Links",     // I — Yes/No
      "Models Mentioned",   // J — Yes/No (brand collections)
      "Brands Mentioned",   // K — Yes/No (category collections)
      "Footer Words",       // L — brand collections only
      "Footer Rating",      // M
      "Footer Issues",      // N
      "Footer Heading",     // O — Yes/No
      "Brand Link",         // P — Yes/No (link to brand website)
      "SEO Title Score",    // Q
      "SEO Title Issues",   // R
      "Current SEO Title",  // S
      "Meta Desc Score",    // T
      "Meta Desc Issues",   // U
      "Current Meta Desc",  // V
      "Collection URL",     // W
      "Shopify Admin",      // X
      "Top Products",       // Y — top 5 products for context
      "Last Copy Update",   // Z — from metafield
      "Audit Date",         // AA
      "Collection ID",      // AB — full GID
    ],
    // Data rows
    ...sorted.map((a) => [
      a.priorityLabel,
      a.title,
      a.collectionType,
      a.templateSuffix || "(default)",
      a.productsCount,
      a.headerWordCount,
      a.headerRating,
      a.headerIssues.join("; "),
      a.paragraphCount,
      a.hasInternalLinks ? "Yes" : "No",
      a.mentionsModels ? "Yes" : "No",
      a.mentionsBrands ? "Yes" : "No",
      a.footerWordCount,
      a.footerRating,
      a.footerIssues.join("; "),
      a.hasFooterHeading ? "Yes" : "No",
      a.hasBrandWebsiteLink ? "Yes" : "No",
      a.seoTitleScore,
      a.seoTitleIssues.join("; "),
      a.currentSeoTitle,
      a.metaDescScore,
      a.metaDescIssues.join("; "),
      a.currentMetaDesc,
      a.collectionUrl,
      `https://admin.shopify.com/store/${storeName}/collections/${a.id.split("/").pop()}`,
      a.topProductsList,
      a.lastCopyUpdate,
      auditDate,
      a.id,
    ]),
  ];

  await clearAndWrite(sheets, TAB_NAME, rows);

  console.log(`  [collection-sheets] Audit complete: ${summary.total} total, ${audits.length} audited, ${summary.excluded} excluded`);
  console.log(`  [collection-sheets] Types: ${summary.brandCount} Brand, ${summary.categoryCount} Category`);
  console.log(`  [collection-sheets] Ratings: ${summary.good} Good, ${summary.light} Light, ${summary.thin} Thin, ${summary.missing} Missing`);
}
