/**
 * Collection description auditor — grades header content, SEO title, and meta description.
 *
 * Two collection types:
 *   - Brand collections (e.g. "Colnago", "Pinarello") — vendor-based smart collections
 *   - Category collections (e.g. "Cranks", "Road Bikes") — everything else
 *
 * Content ratings: Good | Light | Thin | Missing
 * SEO scores: 0-100
 */

import { type ShopifyCollection } from "./shopify-collections";

export type ContentRating = "Good" | "Light" | "Thin" | "Missing";
export type PriorityLabel = "Critical" | "High" | "Medium" | "Low";
export type CollectionType = "Brand" | "Category";

export interface CollectionAudit {
  // Collection info
  id: string;
  title: string;
  handle: string;
  collectionType: CollectionType;
  templateSuffix: string;
  productsCount: number;
  collectionUrl: string;
  lastCopyUpdate: string;

  // Priority
  priorityScore: number;
  priorityLabel: PriorityLabel;

  // Header content audit
  headerWordCount: number;
  headerRating: ContentRating;
  headerIssues: string[];
  paragraphCount: number;
  hasInternalLinks: boolean;
  mentionsModels: boolean; // brand collections: mentions specific product models
  mentionsBrands: boolean; // category collections: mentions brands carried

  // SEO title audit
  seoTitleScore: number;
  seoTitleIssues: string[];
  currentSeoTitle: string;

  // Meta description audit
  metaDescScore: number;
  metaDescIssues: string[];
  currentMetaDesc: string;

  // Footer audit (brand collections — from "Collection Brand Info" metaobject)
  footerWordCount: number;
  footerRating: ContentRating;
  footerIssues: string[];
  hasFooterHeading: boolean;
  hasBrandWebsiteLink: boolean;

  // Context — top products for the sheet
  topProductsList: string;

  // Excluded (empty collections, system collections)
  excluded: boolean;
}

// ── Collection type detection ──

// Collections to exclude from audit
const EXCLUDED_HANDLES = new Set([
  "frontpage", // Homepage collection
  "all",       // "All Products" auto-collection
]);

const EXCLUDED_TITLE_PATTERNS = [
  /^related_to_/i,
  /^hidden/i,
  /^test/i,
];

// Discover pages have their own copywriting workflow — exclude from collection audit
const EXCLUDED_TEMPLATE_SUFFIXES = new Set([
  "discover-template",
  "discover-2026",
]);

function isExcludedCollection(collection: ShopifyCollection): boolean {
  if (EXCLUDED_HANDLES.has(collection.handle)) return true;
  if (collection.productsCount === 0) return true;
  if (EXCLUDED_TITLE_PATTERNS.some((re) => re.test(collection.title))) return true;
  if (EXCLUDED_TEMPLATE_SUFFIXES.has(collection.templateSuffix)) return true;
  return false;
}

function detectCollectionType(collection: ShopifyCollection): CollectionType {
  // If there's a vendor rule, it's a brand collection
  if (collection.ruleSetVendor) return "Brand";

  // Heuristic: check if the top products all share the same vendor
  // (manual brand collections without rules)
  if (collection.topProducts.length >= 3) {
    const vendors = new Set(collection.topProducts.map((p) => p.vendor.toLowerCase()));
    if (vendors.size === 1 && collection.topProducts[0].vendor) {
      // All products from one vendor — likely a brand collection
      return "Brand";
    }
  }

  return "Category";
}

// ── HTML helpers ──

function stripHtml(html: string): string {
  if (!html) return "";
  let text = html.replace(/<[^>]+>/g, " ");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  text = text.replace(/&#\d+;/g, " ").replace(/&\w+;/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function countParagraphs(html: string): number {
  if (!html) return 0;
  return (html.match(/<p[^>]*>/gi) || []).length;
}

function hasInternalLinks(html: string): boolean {
  if (!html) return false;
  // Links to /collections/, /products/, or relative paths
  return /<a[^>]+href=["'][^"']*(\/collections\/|\/products\/|racycles\.com)/i.test(html);
}

function mentionsSpecificModels(html: string, topProducts: ShopifyCollection["topProducts"]): boolean {
  if (!html || topProducts.length === 0) return false;
  const textLower = stripHtml(html).toLowerCase();

  // Check if the description mentions any of the top product titles (or key parts)
  let matches = 0;
  for (const product of topProducts) {
    // Extract model name — strip the vendor prefix if present
    const titleParts = product.title.split(/\s+/);
    // Use last 2-3 words as model identifier (e.g. "C68", "V5Rs", "Spark 910")
    const modelWords = titleParts.slice(1, 4).join(" ").toLowerCase();
    if (modelWords && textLower.includes(modelWords)) {
      matches++;
    }
  }
  return matches >= 1;
}

function mentionsBrandNames(html: string, topProducts: ShopifyCollection["topProducts"]): boolean {
  if (!html || topProducts.length === 0) return false;
  const textLower = stripHtml(html).toLowerCase();
  const vendors = [...new Set(topProducts.map((p) => p.vendor.toLowerCase()).filter(Boolean))];

  let matches = 0;
  for (const vendor of vendors) {
    if (textLower.includes(vendor)) matches++;
  }
  // Should mention at least 2 brands for category collections
  return matches >= 2;
}

// ── Content grading ──

// Brand collections: 150-300 words ideal, 2-4 paragraphs, should mention models + have internal links
// Category collections: 100-200 words ideal, 1-3 paragraphs, should mention brands

interface ContentConfig {
  thinBelow: number;
  lightBelow: number;
  goodAbove: number;
  label: string;
}

const CONTENT_CONFIG: Record<CollectionType, ContentConfig> = {
  Brand: {
    thinBelow: 50,
    lightBelow: 100,
    goodAbove: 150,
    label: "Brand Collection",
  },
  Category: {
    thinBelow: 30,
    lightBelow: 75,
    goodAbove: 100,
    label: "Category Collection",
  },
};

function gradeHeader(collection: ShopifyCollection, collectionType: CollectionType): Pick<CollectionAudit,
  "headerWordCount" | "headerRating" | "headerIssues" | "paragraphCount" |
  "hasInternalLinks" | "mentionsModels" | "mentionsBrands"
> {
  const html = collection.descriptionHtml || "";
  const plainText = stripHtml(html);
  const wordCount = plainText ? plainText.split(/\s+/).length : 0;
  const config = CONTENT_CONFIG[collectionType];
  const issues: string[] = [];

  // Missing
  if (wordCount === 0) {
    return {
      headerWordCount: 0,
      headerRating: "Missing",
      headerIssues: ["No collection header — needs copy written"],
      paragraphCount: 0,
      hasInternalLinks: false,
      mentionsModels: false,
      mentionsBrands: false,
    };
  }

  // Word count rating
  let rating: ContentRating;
  if (wordCount < config.thinBelow) {
    rating = "Thin";
    issues.push(`Only ${wordCount} words (minimum ${config.thinBelow} for ${config.label})`);
  } else if (wordCount < config.goodAbove) {
    rating = "Light";
    issues.push(`${wordCount} words — could be stronger (ideal ${config.goodAbove}+ for ${config.label})`);
  } else {
    rating = "Good";
  }

  // Structural checks
  const paragraphs = countParagraphs(html);
  const links = hasInternalLinks(html);
  const models = mentionsSpecificModels(html, collection.topProducts);
  const brands = mentionsBrandNames(html, collection.topProducts);

  if (paragraphs < 2 && wordCount >= config.thinBelow) {
    issues.push(`Only ${paragraphs} paragraph(s) — should be 2-4`);
    if (rating === "Good") rating = "Light";
  }

  if (!links && wordCount >= config.thinBelow) {
    issues.push("No internal links to products or sub-collections");
    if (rating === "Good") rating = "Light";
  }

  if (collectionType === "Brand" && !models && wordCount >= config.thinBelow) {
    issues.push("Doesn't mention specific models — should reference current lineup");
  }

  if (collectionType === "Category" && !brands && wordCount >= config.thinBelow) {
    issues.push("Doesn't mention brand names — should reference top brands carried");
  }

  // Red flags
  const textLower = plainText.toLowerCase();
  if (textLower.includes("lorem ipsum")) {
    issues.push("Contains placeholder text (lorem ipsum)");
    rating = "Thin";
  }
  if (textLower.includes("coming soon")) {
    issues.push("Contains placeholder text (coming soon)");
    rating = "Thin";
  }

  return {
    headerWordCount: wordCount,
    headerRating: rating,
    headerIssues: issues,
    paragraphCount: paragraphs,
    hasInternalLinks: links,
    mentionsModels: models,
    mentionsBrands: brands,
  };
}

// ── Footer grading (brand collections only) ──

// Footer should be 100+ words about the brand's history, heritage, and RA's relationship.
// Should have a heading and ideally link to the brand's website.

function gradeFooter(collection: ShopifyCollection, collectionType: CollectionType): Pick<CollectionAudit,
  "footerWordCount" | "footerRating" | "footerIssues" | "hasFooterHeading" | "hasBrandWebsiteLink"
> {
  // Category collections don't use the footer metaobject (yet)
  if (collectionType === "Category") {
    return {
      footerWordCount: 0,
      footerRating: "Missing",
      footerIssues: ["N/A — Category collection (no footer expected)"],
      hasFooterHeading: false,
      hasBrandWebsiteLink: false,
    };
  }

  const footerText = collection.footerHtml || "";
  const wordCount = footerText ? footerText.split(/\s+/).length : 0;
  const hasHeading = !!collection.footerHeading;
  const issues: string[] = [];

  // Check for brand website link in the raw rich text JSON
  const hasLink = collection.footerRaw.includes('"type":"link"') ||
                  collection.footerRaw.includes('"url"');

  if (wordCount === 0) {
    return {
      footerWordCount: 0,
      footerRating: "Missing",
      footerIssues: ["No footer text — needs brand history/heritage copy"],
      hasFooterHeading: hasHeading,
      hasBrandWebsiteLink: false,
    };
  }

  let rating: ContentRating;
  if (wordCount < 50) {
    rating = "Thin";
    issues.push(`Only ${wordCount} words (minimum 50 for brand footer)`);
  } else if (wordCount < 100) {
    rating = "Light";
    issues.push(`${wordCount} words — could be stronger (ideal 100+ for brand footer)`);
  } else {
    rating = "Good";
  }

  if (!hasHeading) {
    issues.push("Missing heading for footer section");
  }

  if (!hasLink) {
    issues.push("No link to brand website — should include external brand link");
  }

  if (issues.length === 0) issues.push("Looks good!");

  return {
    footerWordCount: wordCount,
    footerRating: rating,
    footerIssues: issues,
    hasFooterHeading: hasHeading,
    hasBrandWebsiteLink: hasLink,
  };
}

// ── SEO Title grading ──

const TITLE_MIN = 30;
const TITLE_MAX = 60;

function gradeSeoTitle(collection: ShopifyCollection): Pick<CollectionAudit, "seoTitleScore" | "seoTitleIssues" | "currentSeoTitle"> {
  const title = collection.seoTitle || collection.title;
  const issues: string[] = [];
  let score = 100;

  if (!title || title.length === 0) {
    return { seoTitleScore: 0, seoTitleIssues: ["MISSING — No SEO title set"], currentSeoTitle: "" };
  }

  const length = title.length;
  if (length < TITLE_MIN) {
    issues.push(`Too short (${length} chars, min ${TITLE_MIN})`);
    score -= 25;
  } else if (length > TITLE_MAX) {
    issues.push(`Too long (${length} chars, max ${TITLE_MAX}) — truncated in SERPs`);
    score -= 20;
  }

  const titleLower = title.toLowerCase();
  if (!titleLower.includes("ra cycles") && !titleLower.includes("racycles")) {
    issues.push("Missing store name (RA Cycles)");
    score -= 10;
  }

  if (!title.includes("|") && !title.includes("–") && !title.includes("—") && !title.includes(" - ")) {
    issues.push("No separator — should use | for readability");
    score -= 5;
  }

  if (issues.length === 0) issues.push("Looks good!");
  return { seoTitleScore: Math.max(0, score), seoTitleIssues: issues, currentSeoTitle: title };
}

// ── Meta Description grading ──

const DESC_MIN = 70;
const DESC_MAX = 160;

function gradeMetaDesc(collection: ShopifyCollection): Pick<CollectionAudit, "metaDescScore" | "metaDescIssues" | "currentMetaDesc"> {
  const desc = collection.seoDescription;
  const issues: string[] = [];
  let score = 100;

  if (!desc || desc.length === 0) {
    return { metaDescScore: 0, metaDescIssues: ["MISSING — No meta description"], currentMetaDesc: "" };
  }

  const length = desc.length;
  if (length < DESC_MIN) {
    issues.push(`Too short (${length} chars, min ${DESC_MIN})`);
    score -= 30;
  } else if (length > DESC_MAX) {
    issues.push(`Too long (${length} chars, max ${DESC_MAX}) — truncated`);
    score -= 15;
  }

  if (desc.includes("<") && desc.includes(">")) {
    issues.push("Contains HTML tags — should be plain text");
    score -= 20;
  }

  const title = collection.seoTitle || collection.title;
  if (desc.trim().toLowerCase() === title.trim().toLowerCase()) {
    issues.push("Identical to the title — should be unique");
    score -= 25;
  }

  if (issues.length === 0) issues.push("Looks good!");
  return { metaDescScore: Math.max(0, score), metaDescIssues: issues, currentMetaDesc: desc };
}

// ── Priority scoring ──

// Collections with more products and worse content get higher priority
const TYPE_PRIORITY: Record<CollectionType, number> = { Brand: 40, Category: 25 };
const RATING_PRIORITY: Record<ContentRating, number> = { Missing: 40, Thin: 30, Light: 15, Good: 0 };

function calcPriority(
  collectionType: CollectionType,
  rating: ContentRating,
  productsCount: number
): { priorityScore: number; priorityLabel: PriorityLabel } {
  // Type + Rating gives base, product count adds 0-20 bonus
  const countFactor = Math.min(productsCount / 50, 1) * 20;
  const score = Math.round(TYPE_PRIORITY[collectionType] + RATING_PRIORITY[rating] + countFactor);

  let label: PriorityLabel;
  if (rating === "Good") {
    label = "Low";
  } else if (collectionType === "Brand" && (rating === "Missing" || rating === "Thin")) {
    label = "Critical";
  } else if (collectionType === "Brand" || rating === "Missing") {
    label = "High";
  } else if (rating === "Thin") {
    label = "High";
  } else {
    label = "Medium";
  }

  return { priorityScore: score, priorityLabel: label };
}

// ── Main audit function ──

export function auditCollection(collection: ShopifyCollection): CollectionAudit {
  const excluded = isExcludedCollection(collection);
  const collectionUrl = `https://racycles.com/collections/${collection.handle}`;

  if (excluded) {
    return {
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      collectionType: "Category",
      templateSuffix: collection.templateSuffix,
      productsCount: collection.productsCount,
      collectionUrl,
      lastCopyUpdate: collection.lastCopyUpdate,
      priorityScore: 0,
      priorityLabel: "Low",
      headerWordCount: 0,
      headerRating: "Good",
      headerIssues: [],
      paragraphCount: 0,
      hasInternalLinks: false,
      mentionsModels: false,
      mentionsBrands: false,
      seoTitleScore: 0,
      seoTitleIssues: [],
      currentSeoTitle: "",
      metaDescScore: 0,
      metaDescIssues: [],
      currentMetaDesc: "",
      footerWordCount: 0,
      footerRating: "Good",
      footerIssues: [],
      hasFooterHeading: false,
      hasBrandWebsiteLink: false,
      topProductsList: "",
      excluded: true,
    };
  }

  const collectionType = detectCollectionType(collection);
  const header = gradeHeader(collection, collectionType);
  const footer = gradeFooter(collection, collectionType);
  const seoTitle = gradeSeoTitle(collection);
  const metaDesc = gradeMetaDesc(collection);
  const priority = calcPriority(collectionType, header.headerRating, collection.productsCount);

  // Build top products list for the sheet
  const topProductsList = collection.topProducts
    .map((p) => {
      const price = parseFloat(p.price);
      return `${p.title} ($${price.toLocaleString("en-US", { minimumFractionDigits: 0 })})`;
    })
    .join("; ");

  return {
    id: collection.id,
    title: collection.title,
    handle: collection.handle,
    collectionType,
    templateSuffix: collection.templateSuffix,
    productsCount: collection.productsCount,
    collectionUrl,
    lastCopyUpdate: collection.lastCopyUpdate,
    ...priority,
    ...header,
    ...footer,
    ...seoTitle,
    ...metaDesc,
    topProductsList,
    excluded: false,
  };
}
