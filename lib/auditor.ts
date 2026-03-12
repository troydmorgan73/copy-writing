/**
 * Product description auditor — grades body content, page title, and meta description.
 *
 * Content ratings: Good | Light | Thin | Missing
 * SEO title: scored 0-100
 * Meta description: scored 0-100
 */

import { type ShopifyProduct } from "./shopify";
import { getContentTier, isExcluded, TIER_CONFIG, type Tier } from "./tier-mapping";

export type ContentRating = "Good" | "Light" | "Thin" | "Missing";

export interface ProductAudit {
  // Product info
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  productUrl: string;

  // Content audit
  contentTier: Tier;
  contentTierLabel: string;
  wordCount: number;
  contentRating: ContentRating;
  contentIssues: string[];
  h3Count: number;
  hasSpecsList: boolean;
  hasDesignBenefits: boolean;
  hasFinalTake: boolean;
  hasBoldProductName: boolean;

  // SEO title audit
  seoTitleScore: number;
  seoTitleIssues: string[];
  currentSeoTitle: string;

  // Meta description audit
  metaDescScore: number;
  metaDescIssues: string[];
  currentMetaDesc: string;

  // Overall
  excluded: boolean;
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

function countH3(html: string): number {
  return (html.match(/<h3[^>]*>/gi) || []).length;
}

function hasSpecsList(html: string): boolean {
  if (/specs_at_a_glance/i.test(html)) return true;
  if (/<ul[^>]*>[\s\S]*?<li[^>]*>\s*<strong>/i.test(html)) return true;
  return false;
}

function hasDesignBenefits(html: string): boolean {
  if (/design_benefits/i.test(html)) return true;
  if (/<h3[^>]*>[\s\S]*?Design Benefits[\s\S]*?<\/h3>/i.test(html)) return true;
  return false;
}

function hasFinalTake(html: string): boolean {
  return /<h3[^>]*>[\s\S]*?Final Take[\s\S]*?<\/h3>/i.test(html);
}

function hasBoldProductName(html: string, productName: string): boolean {
  const strongMatches = html.match(/<strong>([\s\S]*?)<\/strong>/gi) || [];
  if (strongMatches.length === 0) return false;

  const nameLower = productName.toLowerCase();
  const nameWords = new Set(nameLower.split(/\s+/));

  for (const match of strongMatches) {
    const inner = match.replace(/<\/?strong>/gi, "").trim().toLowerCase();
    if (nameLower.includes(inner) || inner.includes(nameLower)) return true;
    const matchWords = new Set(inner.split(/\s+/));
    const overlap = [...nameWords].filter((w) => matchWords.has(w));
    if (overlap.length >= 3 || (nameWords.size <= 3 && overlap.length >= 2)) return true;
  }
  return false;
}

// Clean Shopify internal prefixes from titles
const JUNK_PREFIX_RE = /^related_to_\d+\s*/i;
function cleanProductName(name: string): string {
  return name.replace(JUNK_PREFIX_RE, "").trim();
}

// ── Content grading ──

function gradeContent(product: ShopifyProduct): Pick<ProductAudit,
  "contentTier" | "contentTierLabel" | "wordCount" | "contentRating" |
  "contentIssues" | "h3Count" | "hasSpecsList" | "hasDesignBenefits" |
  "hasFinalTake" | "hasBoldProductName"
> {
  const html = product.descriptionHtml || "";
  const plainText = stripHtml(html);
  const wordCount = plainText ? plainText.split(/\s+/).length : 0;
  const tier = getContentTier(product.productType);
  const config = TIER_CONFIG[tier];
  const issues: string[] = [];

  // Missing
  if (wordCount === 0) {
    return {
      contentTier: tier,
      contentTierLabel: config.label,
      wordCount: 0,
      contentRating: "Missing",
      contentIssues: ["No product description — needs full copy written"],
      h3Count: 0,
      hasSpecsList: false,
      hasDesignBenefits: false,
      hasFinalTake: false,
      hasBoldProductName: false,
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

  // Red flag checks
  const textLower = plainText.toLowerCase();
  if (textLower.includes("lorem ipsum")) {
    issues.push("Contains placeholder text (lorem ipsum)");
    rating = "Thin";
  }
  if (wordCount < 20 && !plainText.includes(".")) {
    issues.push("Appears to be a fragment, not a real description");
    rating = "Thin";
  }
  if (textLower.includes("description coming soon") || textLower.slice(0, 50).includes("coming soon")) {
    issues.push("Contains placeholder text (coming soon)");
    rating = "Thin";
  }

  // Structural checks
  const h3Count = countH3(html);
  const specs = hasSpecsList(html);
  const benefits = hasDesignBenefits(html);
  const finalTake = hasFinalTake(html);
  const structureIssues: string[] = [];

  if (wordCount >= config.thinBelow) {
    if (h3Count < config.requiredH3) {
      structureIssues.push(`Only ${h3Count} section header(s) — ${config.label} should have ${config.requiredH3}+`);
    }
    if (!specs && tier <= 3) {
      structureIssues.push("Missing Specs at a Glance section");
    }
    if (tier <= 2 && !benefits) {
      structureIssues.push("Missing Design Benefits section");
    }
    if (tier === 1 && !finalTake) {
      structureIssues.push("Missing Final Take section");
    }
  }

  // SEO signal checks
  const productName = cleanProductName(product.title);
  const boldName = hasBoldProductName(html, productName);

  if (wordCount >= config.thinBelow && !boldName) {
    structureIssues.push("Product name not bolded (<strong>) in description");
  }

  // Structure issues cap Good at Light
  if (structureIssues.length > 0 && rating === "Good") {
    rating = "Light";
    issues.push("Has enough words but missing structural elements");
  }
  issues.push(...structureIssues);

  return {
    contentTier: tier,
    contentTierLabel: config.label,
    wordCount,
    contentRating: rating,
    contentIssues: issues,
    h3Count,
    hasSpecsList: specs,
    hasDesignBenefits: benefits,
    hasFinalTake: finalTake,
    hasBoldProductName: boldName,
  };
}

// ── SEO Title grading ──

const TITLE_MIN = 30;
const TITLE_MAX = 60;

function gradeSeoTitle(product: ShopifyProduct): Pick<ProductAudit, "seoTitleScore" | "seoTitleIssues" | "currentSeoTitle"> {
  const title = product.seoTitle || product.title;
  const issues: string[] = [];
  let score = 100;

  if (!title || title.length === 0) {
    return { seoTitleScore: 0, seoTitleIssues: ["MISSING — No SEO title set"], currentSeoTitle: "" };
  }

  if (JUNK_PREFIX_RE.test(title)) {
    issues.push("Contains Shopify internal prefix (related_to_XXXXX)");
    score -= 30;
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

  if (product.vendor && !titleLower.includes(product.vendor.toLowerCase())) {
    issues.push(`Missing brand name (${product.vendor})`);
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

function gradeMetaDesc(product: ShopifyProduct): Pick<ProductAudit, "metaDescScore" | "metaDescIssues" | "currentMetaDesc"> {
  const desc = product.seoDescription;
  const issues: string[] = [];
  let score = 100;

  if (!desc || desc.length === 0) {
    return { metaDescScore: 0, metaDescIssues: ["MISSING — No meta description (Google will auto-generate)"], currentMetaDesc: "" };
  }

  if (JUNK_PREFIX_RE.test(desc)) {
    issues.push("Contains Shopify internal prefix");
    score -= 30;
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

  // Duplicate of title
  const title = product.seoTitle || product.title;
  if (desc.trim().toLowerCase() === title.trim().toLowerCase()) {
    issues.push("Identical to the title — should be unique");
    score -= 25;
  }

  if (issues.length === 0) issues.push("Looks good!");
  return { metaDescScore: Math.max(0, score), metaDescIssues: issues, currentMetaDesc: desc };
}

// ── Main audit function ──

export function auditProduct(product: ShopifyProduct): ProductAudit {
  const excluded = isExcluded(product.productType);
  const productUrl = `https://racycles.com/products/${product.handle}`;

  if (excluded) {
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.productType,
      status: product.status,
      productUrl,
      contentTier: 3,
      contentTierLabel: "Excluded",
      wordCount: 0,
      contentRating: "Good",
      contentIssues: [],
      h3Count: 0,
      hasSpecsList: false,
      hasDesignBenefits: false,
      hasFinalTake: false,
      hasBoldProductName: false,
      seoTitleScore: 0,
      seoTitleIssues: [],
      currentSeoTitle: "",
      metaDescScore: 0,
      metaDescIssues: [],
      currentMetaDesc: "",
      excluded: true,
    };
  }

  const content = gradeContent(product);
  const seoTitle = gradeSeoTitle(product);
  const metaDesc = gradeMetaDesc(product);

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    productUrl,
    ...content,
    ...seoTitle,
    ...metaDesc,
    excluded: false,
  };
}
