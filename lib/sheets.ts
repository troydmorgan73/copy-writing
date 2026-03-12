/**
 * Google Sheets writer — writes audit results to three tabs:
 *
 * Tab 1: "Full Audit"     — Every audited product with all scores
 * Tab 2: "Cleanup Queue"  — Products rated below "Good" (drops off when re-audited as Good)
 * Tab 3: "Summary"        — Roll-up stats by tier and rating
 */

import { google } from "googleapis";
import { type ProductAudit, type ContentRating } from "./auditor";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

// Tab names — these must match (or be created in) the existing Google Sheet
const FULL_AUDIT_TAB = "Full Audit";
const CLEANUP_TAB = "Cleanup Queue";
const SUMMARY_TAB = "Summary";

// ── Auth ──

function getAuthClient() {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, "base64").toString("utf-8");
  const key = JSON.parse(keyJson);

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
  /**
   * Check if a tab exists; create it if not.
   */
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

  // Ensure all tabs exist
  await ensureTab(sheets, FULL_AUDIT_TAB);
  await ensureTab(sheets, CLEANUP_TAB);
  await ensureTab(sheets, SUMMARY_TAB);

  const auditDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // ── Tab 1: Full Audit ──
  // Sort by rating (worst first), then by tier (biggest first), then alphabetical
  const sorted = [...audits].sort((a, b) => {
    const ratingDiff = RATING_ORDER[a.contentRating] - RATING_ORDER[b.contentRating];
    if (ratingDiff !== 0) return ratingDiff;
    const tierDiff = a.contentTier - b.contentTier;
    if (tierDiff !== 0) return tierDiff;
    return a.title.localeCompare(b.title);
  });

  const fullAuditRows: (string | number)[][] = [
    // Header row
    [
      "Product Title",
      "Vendor",
      "Product Type",
      "Status",
      "Tier",
      "Word Count",
      "Content Rating",
      "Content Issues",
      "H3 Count",
      "Has Specs",
      "Has Benefits",
      "Has Final Take",
      "Bold Name",
      "SEO Title Score",
      "SEO Title Issues",
      "Current SEO Title",
      "Meta Desc Score",
      "Meta Desc Issues",
      "Current Meta Desc",
      "Product URL",
      "Shopify Admin",
      "Audit Date",
    ],
    // Data rows
    ...sorted.map((a) => [
      a.title,
      a.vendor,
      a.productType,
      a.status,
      `T${a.contentTier}`,
      a.wordCount,
      a.contentRating,
      a.contentIssues.join("; "),
      a.h3Count,
      a.hasSpecsList ? "Yes" : "No",
      a.hasDesignBenefits ? "Yes" : "No",
      a.hasFinalTake ? "Yes" : "No",
      a.hasBoldProductName ? "Yes" : "No",
      a.seoTitleScore,
      a.seoTitleIssues.join("; "),
      a.currentSeoTitle,
      a.metaDescScore,
      a.metaDescIssues.join("; "),
      a.currentMetaDesc,
      a.productUrl,
      `https://admin.shopify.com/store/${process.env.SHOPIFY_SHOP_NAME}/products/${a.id.split("/").pop()}`,
      auditDate,
    ]),
  ];

  await clearAndWrite(sheets, FULL_AUDIT_TAB, fullAuditRows);

  // ── Tab 2: Cleanup Queue ──
  // Only products rated below "Good" — sorted worst first
  const needsWork = sorted.filter((a) => a.contentRating !== "Good");

  const cleanupRows: (string | number)[][] = [
    [
      "Product Title",
      "Vendor",
      "Product Type",
      "Tier",
      "Rating",
      "Word Count",
      "Issues",
      "SEO Title Score",
      "Meta Desc Score",
      "Product URL",
      "Shopify Admin",
      "Audit Date",
    ],
    ...needsWork.map((a) => [
      a.title,
      a.vendor,
      a.productType,
      `T${a.contentTier}`,
      a.contentRating,
      a.wordCount,
      a.contentIssues.join("; "),
      a.seoTitleScore,
      a.metaDescScore,
      a.productUrl,
      `https://admin.shopify.com/store/${process.env.SHOPIFY_SHOP_NAME}/products/${a.id.split("/").pop()}`,
      auditDate,
    ]),
  ];

  await clearAndWrite(sheets, CLEANUP_TAB, cleanupRows);

  // ── Tab 3: Summary ──
  // Roll-up stats by tier and overall

  // Count by tier and rating
  const tierStats: Record<number, Record<ContentRating, number>> = {};
  for (const tier of [1, 2, 3, 4]) {
    tierStats[tier] = { Good: 0, Light: 0, Thin: 0, Missing: 0 };
  }
  for (const a of audits) {
    tierStats[a.contentTier][a.contentRating]++;
  }

  // SEO title stats
  const titleMissing = audits.filter((a) => a.seoTitleScore === 0).length;
  const titleWeak = audits.filter((a) => a.seoTitleScore > 0 && a.seoTitleScore < 70).length;
  const titleGood = audits.filter((a) => a.seoTitleScore >= 70).length;

  // Meta desc stats
  const metaMissing = audits.filter((a) => a.metaDescScore === 0).length;
  const metaWeak = audits.filter((a) => a.metaDescScore > 0 && a.metaDescScore < 70).length;
  const metaGood = audits.filter((a) => a.metaDescScore >= 70).length;

  const summaryRows: (string | number)[][] = [
    ["RA Cycles Product Audit Summary", "", "", "", "", ""],
    [`Audit Date: ${auditDate}`, "", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["── CONTENT RATINGS BY TIER ──", "", "", "", "", ""],
    ["Tier", "Good", "Light", "Thin", "Missing", "Total"],
    ...([1, 2, 3, 4] as const).map((tier) => {
      const s = tierStats[tier];
      const total = s.Good + s.Light + s.Thin + s.Missing;
      return [
        `Tier ${tier} (${tier === 1 ? "Bikes/Wheels" : tier === 2 ? "Apparel/Shoes" : tier === 3 ? "Components" : "Accessories"})`,
        s.Good, s.Light, s.Thin, s.Missing, total,
      ];
    }),
    [
      "TOTAL",
      summary.good, summary.light, summary.thin, summary.missing,
      summary.good + summary.light + summary.thin + summary.missing,
    ],
    ["", "", "", "", "", ""],
    ["── OVERALL ──", "", "", "", "", ""],
    ["Total products", summary.total, "", "", "", ""],
    ["Audited", audits.length, "", "", "", ""],
    ["Excluded (Service/Custom)", summary.excluded, "", "", "", ""],
    ["Needs work (below Good)", needsWork.length, "", "", "", ""],
    [
      "Good %",
      audits.length > 0 ? `${((summary.good / audits.length) * 100).toFixed(1)}%` : "N/A",
      "", "", "", "",
    ],
    ["", "", "", "", "", ""],
    ["── SEO TITLE SCORES ──", "", "", "", "", ""],
    ["Good (70+)", titleGood, "", "", "", ""],
    ["Weak (<70)", titleWeak, "", "", "", ""],
    ["Missing (0)", titleMissing, "", "", "", ""],
    ["", "", "", "", "", ""],
    ["── META DESCRIPTION SCORES ──", "", "", "", "", ""],
    ["Good (70+)", metaGood, "", "", "", ""],
    ["Weak (<70)", metaWeak, "", "", "", ""],
    ["Missing (0)", metaMissing, "", "", "", ""],
  ];

  await clearAndWrite(sheets, SUMMARY_TAB, summaryRows);
}
