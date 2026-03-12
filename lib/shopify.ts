/**
 * Shopify GraphQL client — fetches all products with pagination and throttle handling.
 */

const SHOPIFY_STORE = process.env.SHOPIFY_SHOP_NAME!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";

const GRAPHQL_URL = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  seoTitle: string;
  seoDescription: string;
  description: string;
  descriptionHtml: string;
  minPrice: string;
  maxPrice: string;
}

// ── GraphQL with throttle handling ──

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

    // Check for THROTTLED error
    if (result.errors && Array.isArray(result.errors)) {
      const throttled = (result.errors as Array<Record<string, unknown>>).some(
        (err) => (err.extensions as Record<string, unknown>)?.code === "THROTTLED"
      );
      if (throttled) {
        console.log(`  [shopify] Rate limited — waiting 2s (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(2000);
        continue;
      }
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    // Check remaining capacity
    const cost = (result.extensions as Record<string, unknown>)?.cost as Record<string, unknown> | undefined;
    const available = (cost?.throttleStatus as Record<string, unknown>)?.currentlyAvailable as number ?? 1000;
    if (available < 100) {
      const wait = Math.max(((100 - available) / 50) * 1000, 1000);
      console.log(`  [shopify] Throttle low (${available} pts) — waiting ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
    }

    return result.data as Record<string, unknown>;
  }

  throw new Error("Max retries exceeded due to Shopify throttling");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Product fetching ──

const PRODUCTS_QUERY = `
query($first: Int!, $cursor: String) {
  products(first: $first, after: $cursor, sortKey: TITLE) {
    edges {
      cursor
      node {
        id
        title
        handle
        vendor
        productType
        status
        seo {
          title
          description
        }
        descriptionHtml
        description(truncateAt: 300)
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}
`;

export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let cursor: string | null = null;
  let page = 1;

  while (true) {
    const data = await shopifyGraphQL(PRODUCTS_QUERY, { first: 100, cursor });
    const products = data.products as Record<string, unknown>;
    const edges = products.edges as Array<Record<string, unknown>>;

    for (const edge of edges) {
      const node = edge.node as Record<string, unknown>;
      const seo = node.seo as Record<string, unknown> | null;
      const priceRange = node.priceRangeV2 as Record<string, unknown> | null;
      const minVariant = priceRange?.minVariantPrice as Record<string, unknown> | null;
      const maxVariant = priceRange?.maxVariantPrice as Record<string, unknown> | null;

      allProducts.push({
        id: node.id as string,
        title: node.title as string,
        handle: node.handle as string,
        vendor: (node.vendor as string) || "",
        productType: (node.productType as string) || "",
        status: (node.status as string) || "",
        seoTitle: (seo?.title as string) || "",
        seoDescription: (seo?.description as string) || "",
        description: (node.description as string) || "",
        descriptionHtml: (node.descriptionHtml as string) || "",
        minPrice: (minVariant?.amount as string) || "0",
        maxPrice: (maxVariant?.amount as string) || "0",
      });
    }

    const pageInfo = products.pageInfo as Record<string, unknown>;
    console.log(`  [shopify] Page ${page}: ${edges.length} products (${allProducts.length} total)`);

    if (!pageInfo.hasNextPage) break;
    cursor = (edges[edges.length - 1].cursor as string) || null;
    page++;
  }

  return allProducts;
}
