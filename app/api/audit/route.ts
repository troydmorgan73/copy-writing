/**
 * POST /api/audit — Daily product description audit
 *
 * Called by Vercel Cron daily at 6:00 AM UTC.
 * 1. Fetches all products from Shopify GraphQL
 * 2. Grades descriptions, page titles, and meta descriptions
 * 3. Writes results to Google Sheets (Full Audit tab, Cleanup Queue tab, Summary tab)
 *
 * Requires Vercel Pro for maxDuration > 60s (4,000+ products need ~3-4 min).
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllProducts } from "@/lib/shopify";
import { auditProduct, type ProductAudit } from "@/lib/auditor";
import { writeAuditToSheets } from "@/lib/sheets";

// Vercel Pro: up to 300s. Free plan: 10s (won't work for 4k products).
export const maxDuration = 300;

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

    return NextResponse.json({
      success: true,
      stats: { total: products.length, audited: audits.length, excluded, good, light, thin, missing },
      elapsedSeconds: parseFloat(elapsed),
    });
  } catch (error) {
    console.error("[audit] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
