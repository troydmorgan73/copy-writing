/**
 * Shopify GraphQL client for collections — fetches all collections with
 * description, SEO fields, product count, and top products for context.
 */

const RAW_STORE = process.env.SHOPIFY_SHOP_NAME!;
const SHOPIFY_STORE = RAW_STORE.replace(/\.myshopify\.com$/, "");
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";

const GRAPHQL_URL = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  description: string; // plain text truncated
  productsCount: number;
  seoTitle: string;
  seoDescription: string;
  // Smart collection rule — if vendor-based, it's a brand collection
  ruleSetVendor: string | null;
  // Top 5 products by price (for sheet context)
  topProducts: { title: string; vendor: string; price: string }[];
  // Last updated metafield (for tracking revisit dates)
  lastCopyUpdate: string;
  // Template — which Shopify template is assigned (e.g. "collection-with-header", "discover-template")
  templateSuffix: string;
  // Footer — from metaobject "Collection Brand Info" via custom.brand_info_footer
  footerHeading: string;
  footerHtml: string; // rich_text_field JSON → converted to plain text for grading
  footerRaw: string;  // raw rich_text_field JSON
}

// ── GraphQL with throttle handling (mirrors shopify.ts) ──

async function shopifyGraphQL(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { query };
  if (variables) payload.variables = variables;

  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const resp = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error(`Shopify HTTP ${resp.status}: ${await resp.text()}`);
    }

    const result = await resp.json() as Record<string, unknown>;

    if (result.errors && Array.isArray(result.errors)) {
      const throttled = (result.errors as Array<Record<string, unknown>>).some(
        (err) => (err.extensions as Record<string, unknown>)?.code === "THROTTLED"
      );
      if (throttled) {
        console.log(`  [shopify-collections] Rate limited — waiting 2s (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(2000);
        continue;
      }
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    const cost = (result.extensions as Record<string, unknown>)?.cost as Record<string, unknown> | undefined;
    const available = (cost?.throttleStatus as Record<string, unknown>)?.currentlyAvailable as number ?? 1000;
    if (available < 100) {
      const wait = Math.max(((100 - available) / 50) * 1000, 1000);
      console.log(`  [shopify-collections] Throttle low (${available} pts) — waiting ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
    }

    return result.data as Record<string, unknown>;
  }

  throw new Error("Max retries exceeded due to Shopify throttling");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Collection fetching ──

const COLLECTIONS_QUERY = `
query($first: Int!, $cursor: String) {
  collections(first: $first, after: $cursor, sortKey: TITLE) {
    edges {
      cursor
      node {
        id
        title
        handle
        templateSuffix
        descriptionHtml
        description(truncateAt: 300)
        productsCount {
          count
        }
        seo {
          title
          description
        }
        ruleSet {
          rules {
            column
            condition
          }
        }
        lastCopyUpdate: metafield(namespace: "custom", key: "copy_last_updated") {
          value
        }
        brandInfoFooter: metafield(namespace: "custom", key: "brand_info_footer") {
          reference {
            ... on Metaobject {
              fields {
                key
                value
              }
            }
          }
        }
        products(first: 5, sortKey: PRICE, reverse: true) {
          edges {
            node {
              title
              vendor
              priceRangeV2 {
                maxVariantPrice { amount }
              }
            }
          }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}
`;

// ── Rich text field helper ──
// Shopify rich_text_field is JSON with a root/children structure.
// We extract plain text for word counting and grading.
function extractTextFromRichText(jsonStr: string): string {
  if (!jsonStr) return "";
  try {
    const parsed = JSON.parse(jsonStr);
    const texts: string[] = [];
    function walk(node: Record<string, unknown>) {
      if (node.type === "text" && typeof node.value === "string") {
        texts.push(node.value);
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          walk(child as Record<string, unknown>);
        }
      }
    }
    walk(parsed);
    return texts.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

export async function fetchAllCollections(): Promise<ShopifyCollection[]> {
  const allCollections: ShopifyCollection[] = [];
  let cursor: string | null = null;
  let page = 1;

  while (true) {
    const data = await shopifyGraphQL(COLLECTIONS_QUERY, { first: 50, cursor });
    const collections = data.collections as Record<string, unknown>;
    const edges = collections.edges as Array<Record<string, unknown>>;

    for (const edge of edges) {
      const node = edge.node as Record<string, unknown>;
      const seo = node.seo as Record<string, unknown> | null;
      const productsCountObj = node.productsCount as Record<string, unknown> | null;
      const ruleSet = node.ruleSet as Record<string, unknown> | null;
      const lastCopyMeta = node.lastCopyUpdate as Record<string, unknown> | null;
      const brandInfoFooterMeta = node.brandInfoFooter as Record<string, unknown> | null;

      // Extract footer metaobject fields (heading + brand_info rich text)
      let footerHeading = "";
      let footerRaw = "";
      let footerHtml = "";
      if (brandInfoFooterMeta?.reference) {
        const ref = brandInfoFooterMeta.reference as Record<string, unknown>;
        const fields = ref.fields as Array<Record<string, unknown>> | undefined;
        if (fields) {
          for (const field of fields) {
            if (field.key === "heading") footerHeading = (field.value as string) || "";
            if (field.key === "brand_info") {
              footerRaw = (field.value as string) || "";
              footerHtml = extractTextFromRichText(footerRaw);
            }
          }
        }
      }

      // Check if any rule is vendor-based (= brand collection)
      let ruleSetVendor: string | null = null;
      if (ruleSet?.rules) {
        const rules = ruleSet.rules as Array<Record<string, unknown>>;
        const vendorRule = rules.find((r) => (r.column as string) === "VENDOR");
        if (vendorRule) {
          ruleSetVendor = (vendorRule.condition as string) || null;
        }
      }

      // Extract top products
      const productEdges = ((node.products as Record<string, unknown>)?.edges as Array<Record<string, unknown>>) || [];
      const topProducts = productEdges.map((pe) => {
        const pNode = pe.node as Record<string, unknown>;
        const priceRange = pNode.priceRangeV2 as Record<string, unknown> | null;
        const maxPrice = priceRange?.maxVariantPrice as Record<string, unknown> | null;
        return {
          title: (pNode.title as string) || "",
          vendor: (pNode.vendor as string) || "",
          price: (maxPrice?.amount as string) || "0",
        };
      });

      allCollections.push({
        id: node.id as string,
        title: node.title as string,
        handle: (node.handle as string) || "",
        templateSuffix: (node.templateSuffix as string) || "",
        descriptionHtml: (node.descriptionHtml as string) || "",
        description: (node.description as string) || "",
        productsCount: (productsCountObj?.count as number) || 0,
        seoTitle: (seo?.title as string) || "",
        seoDescription: (seo?.description as string) || "",
        ruleSetVendor,
        topProducts,
        lastCopyUpdate: (lastCopyMeta?.value as string) || "",
        footerHeading,
        footerHtml,
        footerRaw,
      });
    }

    const pageInfo = collections.pageInfo as Record<string, unknown>;
    console.log(`  [shopify-collections] Page ${page}: ${edges.length} collections (${allCollections.length} total)`);

    if (!pageInfo.hasNextPage) break;
    cursor = (edges[edges.length - 1].cursor as string) || null;
    page++;
  }

  return allCollections;
}
