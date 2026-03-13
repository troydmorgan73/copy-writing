/**
 * POST /api/push-description — Push a product description to Shopify
 *
 * Accepts a JSON body with:
 *   productId:   Shopify GID (e.g., "gid://shopify/Product/123456")
 *   html:        Full product description HTML
 *   seoTitle:    SEO page title (optional)
 *   metaDesc:    Meta description (optional)
 *
 * Protected by CRON_SECRET via Bearer token (same secret used for /api/audit).
 * Returns the updated product title, handle, and admin URL.
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// ── Auth ──

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

// ── Shopify GraphQL (lightweight — doesn't need the full lib) ──

const RAW_STORE = process.env.SHOPIFY_SHOP_NAME || "";
const SHOPIFY_STORE = RAW_STORE.replace(/\.myshopify\.com$/, "");
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";
const GRAPHQL_URL = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;

const UPDATE_MUTATION = `
  mutation($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SET_METAFIELD_MUTATION = `
  mutation($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface ProductInput {
  id: string;
  descriptionHtml: string;
  seo?: {
    title?: string;
    description?: string;
  };
}

interface PushRequestBody {
  productId: string;
  html: string;
  seoTitle?: string;
  metaDesc?: string;
}

// ── Handler ──

export async function POST(req: NextRequest) {
  // Auth check
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate env
  if (!SHOPIFY_TOKEN) {
    return NextResponse.json(
      { error: "SHOPIFY_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  // Parse body
  let body: PushRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { productId, html, seoTitle, metaDesc } = body;

  if (!productId || !html) {
    return NextResponse.json(
      { error: "Missing required fields: productId, html" },
      { status: 400 }
    );
  }

  // Build mutation input
  const input: ProductInput = {
    id: productId,
    descriptionHtml: html,
  };

  const seo: { title?: string; description?: string } = {};
  if (seoTitle) seo.title = seoTitle;
  if (metaDesc) seo.description = metaDesc;
  if (Object.keys(seo).length > 0) input.seo = seo;

  // Push to Shopify
  try {
    const resp = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      },
      body: JSON.stringify({
        query: UPDATE_MUTATION,
        variables: { input },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Shopify HTTP ${resp.status}`, detail: text },
        { status: 502 }
      );
    }

    const result = await resp.json();

    if (result.errors) {
      return NextResponse.json(
        { error: "GraphQL errors", detail: result.errors },
        { status: 502 }
      );
    }

    const { product, userErrors } = result.data.productUpdate;

    if (userErrors && userErrors.length > 0) {
      return NextResponse.json(
        { error: "Shopify rejected the update", detail: userErrors },
        { status: 422 }
      );
    }

    // Step 2: Set metafield — mark description as complete
    const metafieldResp = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      },
      body: JSON.stringify({
        query: SET_METAFIELD_MUTATION,
        variables: {
          metafields: [
            {
              ownerId: product.id,
              namespace: "custom",
              key: "product_description_needs",
              type: "single_line_text_field",
              value: "Complete",
            },
          ],
        },
      }),
    });

    let metafieldOk = false;
    if (metafieldResp.ok) {
      const mfResult = await metafieldResp.json();
      const mfErrors = mfResult?.data?.metafieldsSet?.userErrors;
      metafieldOk = !mfErrors || mfErrors.length === 0;
      if (!metafieldOk) {
        console.log("[push-description] Metafield errors:", mfErrors);
      }
    }

    // Success
    const numericId = product.id.split("/").pop();
    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        liveUrl: `https://racycles.com/products/${product.handle}`,
        adminUrl: `https://admin.shopify.com/store/${SHOPIFY_STORE}/products/${numericId}`,
      },
      seo: {
        title: seoTitle || null,
        metaDesc: metaDesc || null,
      },
      metafield: {
        set: metafieldOk,
        field: "custom.product_description_needs",
        value: "Complete",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Failed to reach Shopify", detail: message },
      { status: 502 }
    );
  }
}
