/**
 * Google Apps Script — RA Cycles Copy Writing Tools
 *
 * Custom menu in Google Sheets toolbar with:
 * 1. Pull Products — triggers the Vercel product audit endpoint
 * 2. Pull Collections — triggers the Vercel collection audit endpoint
 * 3. Compile Product Info — builds Compiled Info blocks + priority colors for Product Page Copy tab
 * 4. Compile Collection Info — builds Compiled Info blocks + priority colors for Collection Audit tab
 *
 * Also includes the doPost() web app handler for adding/deleting/updating products from Shopify.
 *
 * SETUP:
 * 1. Open the Google Sheet → Extensions → Apps Script
 * 2. Replace everything with this file
 * 3. Click Save → Run → onOpen (approve permissions)
 * 4. Reload the Google Sheet — "RA Cycles" menu appears in the toolbar
 *
 * SCRIPT PROPERTIES (set in Apps Script → Project Settings → Script Properties):
 *   VERCEL_CRON_SECRET — same as the CRON_SECRET env var in Vercel
 *   VERCEL_BASE_URL — e.g. https://copy-writing-rouge.vercel.app
 */

// ── Constants ──

var SHEET_ID = '1HWLP8TF8B45rC3fi0zQ982ZcKhPcjmZdiksR9oWcisY';
var DEFAULT_TAB_NAME = 'Copy';
var COLLECTIVE_TAB_NAME = 'Shopify Collective Products';
var PRODUCT_AUDIT_TAB = 'Product Page Copy';
var COLLECTION_AUDIT_TAB = 'Collection Audit';


// ══════════════════════════════════════════════════════════════════════
// TOOLBAR MENU
// ══════════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RA Cycles')
    .addItem('Pull Products', 'pullProducts')
    .addItem('Pull Collections', 'pullCollections')
    .addSeparator()
    .addItem('Compile Product Info', 'compileProductInfo')
    .addItem('Compile Collection Info', 'compileCollectionInfo')
    .addToUi();
}


// ══════════════════════════════════════════════════════════════════════
// PULL PRODUCTS — Triggers the Vercel product audit endpoint
// ══════════════════════════════════════════════════════════════════════

function pullProducts() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty('VERCEL_BASE_URL');
  var cronSecret = props.getProperty('VERCEL_CRON_SECRET');

  if (!baseUrl || !cronSecret) {
    ui.alert('Missing Configuration',
      'Set VERCEL_BASE_URL and VERCEL_CRON_SECRET in Script Properties.\n\n' +
      'Go to: Project Settings → Script Properties',
      ui.ButtonSet.OK);
    return;
  }

  ui.alert('Pulling Products',
    'Starting product audit — this takes 3-4 minutes.\n' +
    'You\'ll get a notification when it\'s done.\n\n' +
    'The sheet will update automatically.',
    ui.ButtonSet.OK);

  try {
    var response = UrlFetchApp.fetch(baseUrl + '/api/audit', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + cronSecret },
      muteHttpExceptions: true
    });

    var status = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (status === 200 && body.success) {
      var stats = body.stats;
      ui.alert('Product Audit Complete',
        'Audited ' + stats.audited + ' products in ' + body.elapsedSeconds + 's\n\n' +
        'Critical: ' + stats.critical + '  |  High: ' + stats.high + '\n' +
        'Missing: ' + stats.missing + '  |  Thin: ' + stats.thin + '\n' +
        'Light: ' + stats.light + '  |  Good: ' + stats.good + '\n\n' +
        'Run "Compile Product Info" to generate Compiled Info blocks.',
        ui.ButtonSet.OK);
    } else {
      ui.alert('Product Audit Failed',
        'Status: ' + status + '\n' + (body.error || 'Unknown error'),
        ui.ButtonSet.OK);
    }
  } catch (err) {
    ui.alert('Error', 'Failed to reach Vercel: ' + err.toString(), ui.ButtonSet.OK);
  }
}


// ══════════════════════════════════════════════════════════════════════
// PULL COLLECTIONS — Triggers the Vercel collection audit endpoint
// ══════════════════════════════════════════════════════════════════════

function pullCollections() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty('VERCEL_BASE_URL');
  var cronSecret = props.getProperty('VERCEL_CRON_SECRET');

  if (!baseUrl || !cronSecret) {
    ui.alert('Missing Configuration',
      'Set VERCEL_BASE_URL and VERCEL_CRON_SECRET in Script Properties.\n\n' +
      'Go to: Project Settings → Script Properties',
      ui.ButtonSet.OK);
    return;
  }

  ui.alert('Pulling Collections',
    'Starting collection audit — this takes 1-2 minutes.\n' +
    'You\'ll get a notification when it\'s done.\n\n' +
    'The sheet will update automatically.',
    ui.ButtonSet.OK);

  try {
    var response = UrlFetchApp.fetch(baseUrl + '/api/collection-audit', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + cronSecret },
      muteHttpExceptions: true
    });

    var status = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (status === 200 && body.success) {
      var stats = body.stats;
      ui.alert('Collection Audit Complete',
        'Audited ' + stats.audited + ' collections in ' + body.elapsedSeconds + 's\n\n' +
        'Brand: ' + stats.brandCount + '  |  Category: ' + stats.categoryCount + '\n' +
        'Critical: ' + stats.critical + '  |  High: ' + stats.high + '\n' +
        'Missing: ' + stats.missing + '  |  Thin: ' + stats.thin + '\n' +
        'Light: ' + stats.light + '  |  Good: ' + stats.good + '\n\n' +
        'Run "Compile Collection Info" to generate Compiled Info blocks.',
        ui.ButtonSet.OK);
    } else {
      ui.alert('Collection Audit Failed',
        'Status: ' + status + '\n' + (body.error || 'Unknown error'),
        ui.ButtonSet.OK);
    }
  } catch (err) {
    ui.alert('Error', 'Failed to reach Vercel: ' + err.toString(), ui.ButtonSet.OK);
  }
}


// ══════════════════════════════════════════════════════════════════════
// COMPILE PRODUCT INFO — Builds Compiled Info blocks for Product Page Copy tab
// ══════════════════════════════════════════════════════════════════════

function compileProductInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PRODUCT_AUDIT_TAB);

  if (!sheet) {
    Logger.log(PRODUCT_AUDIT_TAB + " tab not found");
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
    AUDIT_DATE:       22,  // V - Audit Date
    PRODUCT_ID:       23   // W - Shopify Product ID
  };

  var totalCols = 23;

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
    "Critical": "#ea4335",
    "High":     "#ff9900",
    "Medium":   "#fbbc04",
    "Low":      "#34a853"
  };

  var priorityFontColors = {
    "Critical": "#ffffff",
    "High":     "#ffffff",
    "Medium":   "#000000",
    "Low":      "#ffffff"
  };

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
    var productId = row[COL.PRODUCT_ID - 1] || "";

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
      "Current Rating: " + rating + " (" + wordCount + " words)",
      "Shopify Product ID: " + productId
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

  Logger.log("Product compiled info + priority colors updated for " + compiledValues.length + " rows");
}


// ══════════════════════════════════════════════════════════════════════
// COMPILE COLLECTION INFO — Builds Compiled Info blocks for Collection Audit tab
// ══════════════════════════════════════════════════════════════════════

function compileCollectionInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(COLLECTION_AUDIT_TAB);

  if (!sheet) {
    Logger.log(COLLECTION_AUDIT_TAB + " tab not found");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("No data rows found");
    return;
  }

  // Column mapping (1-indexed) — must match collection-sheets.ts header order
  var COL = {
    COMPILED:           1,   // A - Compiled Info
    PRIORITY:           2,   // B - Priority
    TITLE:              3,   // C - Collection Title
    TYPE:               4,   // D - Brand or Category
    TEMPLATE:           5,   // E - Template suffix
    PRODUCTS:           6,   // F - Product count
    HEADER_WORDS:       7,   // G - Header word count
    HEADER_RATING:      8,   // H - Header rating
    HEADER_ISSUES:      9,   // I - Header issues
    PARAGRAPHS:         10,  // J - Paragraph count
    INTERNAL_LINKS:     11,  // K - Yes/No
    MODELS_MENTIONED:   12,  // L - Yes/No
    BRANDS_MENTIONED:   13,  // M - Yes/No
    FOOTER_WORDS:       14,  // N - Footer word count
    FOOTER_RATING:      15,  // O - Footer rating
    FOOTER_ISSUES:      16,  // P - Footer issues
    FOOTER_HEADING:     17,  // Q - Yes/No
    BRAND_LINK:         18,  // R - Yes/No
    SEO_TITLE_SCORE:    19,  // S - SEO title score
    SEO_TITLE_ISSUES:   20,  // T - SEO title issues
    CURRENT_SEO_TITLE:  21,  // U - Current SEO title
    META_SCORE:         22,  // V - Meta desc score
    META_ISSUES:        23,  // W - Meta desc issues
    CURRENT_META:       24,  // X - Current meta desc
    COLLECTION_URL:     25,  // Y - Collection URL
    SHOPIFY_ADMIN:      26,  // Z - Shopify admin link
    TOP_PRODUCTS:       27,  // AA - Top products list
    LAST_COPY_UPDATE:   28,  // AB - Last copy update date
    AUDIT_DATE:         29,  // AC - Audit date
    COLLECTION_ID:      30   // AD - Collection GID
  };

  var totalCols = 30;

  var dataRange = sheet.getRange(2, 1, lastRow - 1, totalCols);
  var data = dataRange.getValues();

  // Priority colors (same as product)
  var priorityColors = {
    "Critical": "#ea4335",
    "High":     "#ff9900",
    "Medium":   "#fbbc04",
    "Low":      "#34a853"
  };

  var priorityFontColors = {
    "Critical": "#ffffff",
    "High":     "#ffffff",
    "Medium":   "#000000",
    "Low":      "#ffffff"
  };

  // Word count targets by type
  var headerTargets = {
    "Brand": "150-300 words",
    "Category": "100-200 words"
  };

  var compiledValues = [];
  var bgColors = [];
  var fontColors = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var priority = row[COL.PRIORITY - 1] || "";
    var title = row[COL.TITLE - 1] || "";
    var type = row[COL.TYPE - 1] || "";
    var template = row[COL.TEMPLATE - 1] || "";
    var productCount = row[COL.PRODUCTS - 1] || 0;
    var headerWords = row[COL.HEADER_WORDS - 1] || 0;
    var headerRating = row[COL.HEADER_RATING - 1] || "";
    var footerWords = row[COL.FOOTER_WORDS - 1] || 0;
    var footerRating = row[COL.FOOTER_RATING - 1] || "";
    var collectionUrl = row[COL.COLLECTION_URL - 1] || "";
    var topProducts = row[COL.TOP_PRODUCTS - 1] || "";
    var lastUpdate = row[COL.LAST_COPY_UPDATE - 1] || "";
    var collectionId = row[COL.COLLECTION_ID - 1] || "";
    var currentSeoTitle = row[COL.CURRENT_SEO_TITLE - 1] || "";
    var currentMeta = row[COL.CURRENT_META - 1] || "";

    // Priority colors
    bgColors.push([priorityColors[priority] || "#ffffff"]);
    fontColors.push([priorityFontColors[priority] || "#000000"]);

    if (!title) {
      compiledValues.push([""]);
      continue;
    }

    var target = headerTargets[type] || "unknown";

    var lines = [
      "Collection: " + title,
      "Type: " + type + " collection",
      "Template: " + template,
      "Products: " + productCount,
      "Collection URL: " + collectionUrl,
      "",
      "Header: " + headerRating + " (" + headerWords + " words, target " + target + ")",
      "Footer: " + footerRating + " (" + footerWords + " words)"
    ];

    if (currentSeoTitle) {
      lines.push("Current SEO Title: " + currentSeoTitle);
    }
    if (currentMeta) {
      lines.push("Current Meta Desc: " + currentMeta);
    }

    if (topProducts) {
      lines.push("", "Top Products: " + topProducts);
    }

    if (lastUpdate) {
      lines.push("Last Copy Update: " + lastUpdate);
    }

    lines.push("Collection ID: " + collectionId);

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

  Logger.log("Collection compiled info + priority colors updated for " + compiledValues.length + " rows");
}


// ══════════════════════════════════════════════════════════════════════
// LEGACY: compileSeoInfo — kept for backward compatibility with triggers
// ══════════════════════════════════════════════════════════════════════

function compileSeoInfo() {
  compileProductInfo();
}


// ══════════════════════════════════════════════════════════════════════
// WEB APP — doPost handler for adding/deleting/updating products
// ══════════════════════════════════════════════════════════════════════

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var product = payload.product;
    var targetSheetName = payload.targetSheet || DEFAULT_TAB_NAME;

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(targetSheetName);

    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'Sheet not found' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var cleanId = product.id.split('/').pop();

    // --- Delete Action ---
    if (action === 'delete') {
      var data = sheet.getDataRange().getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        if ('' + data[i][0] === '' + cleanId) {
          sheet.deleteRow(i + 1);
          console.log("Deleted Row: " + (i + 1));
          break;
        }
      }
    }

    // --- Add Action ---
    else if (action === 'add') {
      var data = sheet.getDataRange().getValues();
      var productExists = false;
      var lastRealRow = 0;

      for (var i = 0; i < data.length; i++) {
        if ('' + data[i][0] === '' + cleanId) {
          productExists = true;
          break;
        }
        if (data[i][0] !== "" && data[i][0] != null) {
          lastRealRow = i + 1;
        }
      }

      if (!productExists) {
        var newRow = lastRealRow + 1;
        console.log("Writing to Calculated Row: " + newRow);

        var shopifyHyperlink = '=HYPERLINK("' + product.shopifyLink + '", "View in Shopify")';
        var vendorHyperlink = product.vendorUrl ? '=HYPERLINK("' + product.vendorUrl + '")' : '';
        var bikeBuild = product.customBikeBaseBuild || '';
        var currentCopy = product.currentCopy || '';

        // Format price display
        var priceDisplay = '';
        if (product.price) {
          var price = parseFloat(product.price);
          priceDisplay = '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // Build Compiled Info text
        var compiled = 'Product Name: ' + product.title;
        if (product.onlineStoreUrl) {
          compiled += '\nRA Cycles Product page: ' + product.onlineStoreUrl;
        }
        compiled += '\nManufacturer: ' + product.vendor;
        compiled += '\nCycling product type: ' + product.productType;
        if (bikeBuild) {
          compiled += '\nBike Component Build: ' + bikeBuild;
        }
        if (product.vendorUrl) {
          compiled += '\nManufacturer URL: ' + product.vendorUrl;
        }
        if (priceDisplay) {
          compiled += '\nPrice: ' + priceDisplay;
        }
        if (targetSheetName === COLLECTIVE_TAB_NAME && currentCopy) {
          compiled += '\nCurrent Copy: ' + currentCopy;
        }

        // Column layout:
        // A: Shopify Product ID | B: Product Name | C: Brand | D: Product Type
        // E: Shopify admin url | F: Brand URL | G: Compiled Info | H: Date added
        // I: Product Created Date | J: Bike Component Build | K: Price
        // L: Current Copy (Collective only)
        var rowData = [
          cleanId, product.title, product.vendor, product.productType,
          shopifyHyperlink, vendorHyperlink, compiled, new Date(),
          product.createdAt || '', bikeBuild, priceDisplay
        ];

        if (targetSheetName === COLLECTIVE_TAB_NAME) {
          rowData.push(currentCopy);
        }

        sheet.getRange(newRow, 1, 1, rowData.length).setValues([rowData]);
      }
    }

    // --- Update Action (update Compiled Info + Price on existing row) ---
    else if (action === 'update') {
      var data = sheet.getDataRange().getValues();
      for (var i = 0; i < data.length; i++) {
        if ('' + data[i][0] === '' + cleanId) {
          // Update column G (Compiled Info) = index 7
          if (product.compiledInfo) {
            sheet.getRange(i + 1, 7).setValue(product.compiledInfo);
          }
          // Update column K (Price) = index 11
          if (product.priceDisplay) {
            sheet.getRange(i + 1, 11).setValue(product.priceDisplay);
          }
          break;
        }
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'ok' })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}
