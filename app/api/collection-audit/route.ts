/**
 * GET /api/collection-audit — Collection description audit
 *
 * Called by Vercel Cron daily at 6:15 AM UTC (after the product audit at 6:00).
 * 1. Fetches all collections from Shopify GraphQL
 * 2. Grades header descriptions, SEO titles, and meta descriptions
 * 3. Writes results to Google Sheets ("Collection Audit" tab)
 * 4. Sends a Slack notification with the summary
 *
 * Requires Vercel Pro for maxDuration > 60s.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllCollections } from "@/lib/shopify-collections";
import { auditCollection, type CollectionAudit } from "@/lib/collection-auditor";
import { writeCollectionAuditToSheets } from "@/lib/collection-sheets";

export const maxDuration = 300;

// ── Slack notification ──

async function notifySlack(message: string): Promise<void> {
  const webhookUrl = process.env.RA_TROY_NOTIFY_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[collection-audit] No Slack webhook configured — skipping notification");
    return;
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!resp.ok) {
      console.error(`[collection-audit] Slack notification failed: ${resp.status}`);
    }
  } catch (err) {
    console.error("[collection-audit] Slack notification error:", err);
  }
}

export async function GET(request: NextRequest) {
  // ── AUTH CHECK ──
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log(`[collection-audit] Starting collection audit at ${new Date().toISOString()}`);

  try {
    // ── STEP 1: Fetch all collections from Shopify ──
    console.log("[collection-audit] Fetching collections from Shopify...");
    const collections = await fetchAllCollections();
    console.log(`[collection-audit] Fetched ${collections.length} collections`);

    // ── STEP 2: Audit each collection ──
    console.log("[collection-audit] Grading collections...");
    const audits: CollectionAudit[] = [];
    let missing = 0;
    let thin = 0;
    let light = 0;
    let good = 0;
    let excluded = 0;
    let critical = 0;
    let high = 0;
    let brandCount = 0;
    let categoryCount = 0;

    for (const collection of collections) {
      const audit = auditCollection(collection);
      if (audit.excluded) {
        excluded++;
        continue;
      }
      audits.push(audit);

      if (audit.collectionType === "Brand") brandCount++;
      else categoryCount++;

      switch (audit.headerRating) {
        case "Missing": missing++; break;
        case "Thin": thin++; break;
        case "Light": light++; break;
        case "Good": good++; break;
      }

      if (audit.priorityLabel === "Critical") critical++;
      if (audit.priorityLabel === "High") high++;
    }

    console.log(`[collection-audit] Graded ${audits.length} collections (${excluded} excluded)`);
    console.log(`[collection-audit] Types: ${brandCount} Brand, ${categoryCount} Category`);
    console.log(`[collection-audit] Good: ${good} | Light: ${light} | Thin: ${thin} | Missing: ${missing}`);

    // ── STEP 3: Write to Google Sheets ──
    console.log("[collection-audit] Writing results to Google Sheets...");
    await writeCollectionAuditToSheets(audits, {
      good,
      light,
      thin,
      missing,
      excluded,
      total: collections.length,
      brandCount,
      categoryCount,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[collection-audit] Done in ${elapsed}s`);

    // ── STEP 4: Slack notification ──
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`;
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    await notifySlack(
      `📁 *Collection Audit Complete* — ${today}\n` +
      `Audited *${audits.length}* collections (${excluded} excluded)\n` +
      `Brand: ${brandCount}  |  Category: ${categoryCount}\n\n` +
      `🔴 Critical: ${critical}  |  🟠 High: ${high}\n` +
      `❌ Missing: ${missing}  |  📉 Thin: ${thin}  |  📊 Light: ${light}  |  ✅ Good: ${good}\n\n` +
      `⏱️ Completed in ${elapsed}s\n` +
      `<${sheetUrl}|Open Collection Audit Sheet>`
    );

    return NextResponse.json({
      success: true,
      stats: {
        total: collections.length,
        audited: audits.length,
        excluded,
        brandCount,
        categoryCount,
        good,
        light,
        thin,
        missing,
        critical,
        high,
      },
      elapsedSeconds: parseFloat(elapsed),
    });
  } catch (error) {
    console.error("[collection-audit] Error:", error);

    await notifySlack(
      `⚠️ *Collection Audit FAILED*\n` +
      `Error: ${error instanceof Error ? error.message : "Unknown error"}\n` +
      `Check Vercel logs for details.`
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
