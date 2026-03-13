/**
 * GET /api/audit — Daily product description audit
 *
 * Called by Vercel Cron daily at 6:00 AM UTC.
 * 1. Fetches all products from Shopify GraphQL
 * 2. Grades descriptions, page titles, and meta descriptions
 * 3. Writes results to Google Sheets ("SEO Improvement" tab)
 * 4. Sends a Slack notification with the summary
 *
 * Requires Vercel Pro for maxDuration > 60s (8,000+ products need ~3-4 min).
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllProducts } from "@/lib/shopify";
import { auditProduct, type ProductAudit } from "@/lib/auditor";
import { writeAuditToSheets } from "@/lib/sheets";

// Vercel Pro: up to 300s. Free plan: 10s (won't work for 8k+ products).
export const maxDuration = 300;

// ── Slack notification ──

async function notifySlack(message: string): Promise<void> {
  const webhookUrl = process.env.RA_TROY_NOTIFY_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[audit] No Slack webhook configured — skipping notification");
    return;
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!resp.ok) {
      console.error(`[audit] Slack notification failed: ${resp.status}`);
    }
  } catch (err) {
    console.error("[audit] Slack notification error:", err);
  }
}

export async function GET(request: NextRequest) {
  // ── AUTH CHECK ──
  // Vercel Cron sends this header automatically
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log(`[audit] Starting product audit at ${new Date().toISOString()}`);

  try {
    // ── STEP 1: Fetch all products from Shopify ──
    console.log("[audit] Fetching products from Shopify...");
    const products = await fetchAllProducts();
    console.log(`[audit] Fetched ${products.length} products`);

    // ── STEP 2: Audit each product ──
    console.log("[audit] Grading products...");
    const audits: ProductAudit[] = [];
    let missing = 0;
    let thin = 0;
    let light = 0;
    let good = 0;
    let excluded = 0;
    let critical = 0;
    let high = 0;

    for (const product of products) {
      const audit = auditProduct(product);
      if (audit.excluded) {
        excluded++;
        continue;
      }
      audits.push(audit);

      switch (audit.contentRating) {
        case "Missing": missing++; break;
        case "Thin": thin++; break;
        case "Light": light++; break;
        case "Good": good++; break;
      }

      if (audit.priorityLabel === "Critical") critical++;
      if (audit.priorityLabel === "High") high++;
    }

    console.log(`[audit] Graded ${audits.length} products (${excluded} excluded)`);
    console.log(`[audit] Good: ${good} | Light: ${light} | Thin: ${thin} | Missing: ${missing}`);

    // ── STEP 3: Write to Google Sheets ──
    console.log("[audit] Writing results to Google Sheets...");
    await writeAuditToSheets(audits, {
      good,
      light,
      thin,
      missing,
      excluded,
      total: products.length,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[audit] Done in ${elapsed}s`);

    // ── STEP 4: Slack notification ──
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`;
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    await notifySlack(
      `📋 *Product Audit Complete* — ${today}\n` +
      `Audited *${audits.length.toLocaleString()}* products (${excluded} excluded)\n\n` +
      `🔴 Critical: ${critical}  |  🟠 High: ${high}\n` +
      `❌ Missing: ${missing}  |  📉 Thin: ${thin}  |  📊 Light: ${light}  |  ✅ Good: ${good}\n\n` +
      `⏱️ Completed in ${elapsed}s\n` +
      `<${sheetUrl}|Open SEO Improvement Sheet>`
    );

    return NextResponse.json({
      success: true,
      stats: { total: products.length, audited: audits.length, excluded, good, light, thin, missing, critical, high },
      elapsedSeconds: parseFloat(elapsed),
    });
  } catch (error) {
    console.error("[audit] Error:", error);

    // Notify on failure too
    await notifySlack(
      `⚠️ *Product Audit FAILED*\n` +
      `Error: ${error instanceof Error ? error.message : "Unknown error"}\n` +
      `Check Vercel logs for details.`
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
