/**
 * Google Apps Script — Compiled Info + Priority Color Coding for "SEO Improvement" tab
 *
 * This script:
 * 1. Populates column A ("Compiled Info") with a research-ready text block
 * 2. Color-codes column B ("Priority") — Critical=red, High=orange, Medium=yellow, Low=green
 *
 * SETUP:
 * 1. Open the Google Sheet
 * 2. Extensions → Apps Script
 * 3. Paste this entire file into the editor
 * 4. Click Save
 * 5. Run → compileSeoInfo (first run will ask for permissions — approve them)
 * 6. To auto-run after each audit: Triggers → Add Trigger →
 *    Function: compileSeoInfo, Event: Time-driven, Day timer, 7am-8am
 *    (set ~1 hour after the 6am UTC cron so the data is fresh)
 */

function compileSeoInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("SEO Improvement");

  if (!sheet) {
    Logger.log("SEO Improvement tab not found");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("No data rows found");
    return;
  }

  // Column mapping (1-indexed) — must match sheets.ts header order
  var COL = {
    COMPILED:         1,   // A - Compiled Info (what we're writing)
    PRIORITY:         2,   // B - Priority (color-coded)
    TITLE:            3,   // C - Product Title
    VENDOR:           4,   // D - Vendor
    PRODUCT_TYPE:     5,   // E - Product Type
    TIER:             6,   // F - Tier
    WORD_COUNT:       7,   // G - Word Count
    CONTENT_RATING:   8,   // H - Content Rating
    CONTENT_ISSUES:   9,   // I - Content Issues
    H3_COUNT:         10,  // J - H3 Count
    BOLD_NAME:        11,  // K - Bold Name
    SEO_TITLE_SCORE:  12,  // L - SEO Title Score
    SEO_TITLE_ISSUES: 13,  // M - SEO Title Issues
    CURRENT_SEO:      14,  // N - Current SEO Title
    META_SCORE:       15,  // O - Meta Desc Score
    META_ISSUES:      16,  // P - Meta Desc Issues
    CURRENT_META:     17,  // Q - Current Meta Desc
    PRODUCT_URL:      18,  // R - Product URL
    SHOPIFY_ADMIN:    19,  // S - Shopify Admin
    MANUFACTURER_URL: 20,  // T - Manufacturer URL
    PRICE:            21,  // U - Price
    AUDIT_DATE:       22   // V - Audit Date
  };

  var totalCols = 22;

  // Read all data at once (much faster than cell-by-cell)
  var dataRange = sheet.getRange(2, 1, lastRow - 1, totalCols);
  var data = dataRange.getValues();

  // Tier target word counts
  var tierTargets = {
    "T1": "700-1,000 words",
    "T2": "400-600 words",
    "T3": "200-400 words",
    "T4": "50-200 words"
  };

  // Priority colors
  var priorityColors = {
    "Critical": "#ea4335",  // Red
    "High":     "#ff9900",  // Orange
    "Medium":   "#fbbc04",  // Yellow
    "Low":      "#34a853"   // Green
  };

  var priorityFontColors = {
    "Critical": "#ffffff",  // White text on red
    "High":     "#ffffff",  // White text on orange
    "Medium":   "#000000",  // Black text on yellow
    "Low":      "#ffffff"   // White text on green
  };

  // Build compiled info and collect priority colors
  var compiledValues = [];
  var bgColors = [];
  var fontColors = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var priority = row[COL.PRIORITY - 1] || "";
    var title = row[COL.TITLE - 1] || "";
    var vendor = row[COL.VENDOR - 1] || "";
    var productType = row[COL.PRODUCT_TYPE - 1] || "";
    var tier = row[COL.TIER - 1] || "";
    var wordCount = row[COL.WORD_COUNT - 1] || 0;
    var rating = row[COL.CONTENT_RATING - 1] || "";
    var productUrl = row[COL.PRODUCT_URL - 1] || "";
    var manufacturerUrl = row[COL.MANUFACTURER_URL - 1] || "";
    var price = row[COL.PRICE - 1] || "";

    // Priority colors
    bgColors.push([priorityColors[priority] || "#ffffff"]);
    fontColors.push([priorityFontColors[priority] || "#000000"]);

    if (!title) {
      compiledValues.push([""]);
      continue;
    }

    var target = tierTargets[tier] || "unknown";

    var lines = [
      "Product Name: " + title,
      "RA Cycles Product page: " + productUrl,
      "Manufacturer: " + vendor,
      "Cycling product type: " + productType,
      "Manufacturer URL: " + manufacturerUrl,
      "Price: " + price,
      "Content Tier: " + tier + " (target " + target + ")",
      "Current Rating: " + rating + " (" + wordCount + " words)"
    ];

    compiledValues.push([lines.join("\n")]);
  }

  // Write compiled info to column A
  if (compiledValues.length > 0) {
    sheet.getRange(2, COL.COMPILED, compiledValues.length, 1).setValues(compiledValues);
  }

  // Apply priority colors to column B
  if (bgColors.length > 0) {
    var priorityRange = sheet.getRange(2, COL.PRIORITY, bgColors.length, 1);
    priorityRange.setBackgrounds(bgColors);
    priorityRange.setFontColors(fontColors);
    priorityRange.setFontWeight("bold");
    priorityRange.setHorizontalAlignment("center");
  }

  Logger.log("Compiled info + priority colors updated for " + compiledValues.length + " products");
}
