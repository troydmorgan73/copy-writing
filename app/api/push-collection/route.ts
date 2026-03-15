/**
 * POST /api/push-collection — Push collection copy to Shopify
 *
 * Accepts a JSON body with:
 *   collectionId:  Shopify GID (e.g., "gid://shopify/Collection/123456")
 *   headerHtml:    Collection description HTML (above the product grid)
 *   seoTitle:      SEO page title (optional)
 *   metaDesc:      Meta description (optional)
 *   footerHeading: Footer section heading (optional — brand collections only)
 *   footerHtml:    Footer rich text as Shopify JSON (optional — brand collections only)
 *
 * Updates:
 *   1. Collection descriptionHtml (header)
 *   2. SEO title + meta description
 *   3. custom.copy_last_updated metafield (today's date)
 *   4. Footer metaobject heading + brand_info (if footer fields provided)
 *      — auto-creates metaobject + links it if none exists
 *
 * Protected by CRON_SECRET via Bearer token.
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

// ── Shopify GraphQL ──

const RAW_STORE = process.env.SHOPIFY_SHOP_NAME || "";
const SHOPIFY_STORE = RAW_STORE.replace(/\.myshopify\.com$/, "");
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";
const GRAPHQL_URL = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;

async function shopifyGraphQL(query: string, variables?: Record<string, unknown>) {
  const resp = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Shopify HTTP ${resp.status}: ${text}`);
  }

  const result = await resp.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result;
}

// ── Mutations ──

const UPDATE_COLLECTION = `
  mutation($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection {
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

const SET_METAFIELD = `
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

// Query to find the footer metaobject linked to a collection
const GET_FOOTER_METAOBJECT = `
  query($collectionId: ID!) {
    collection(id: $collectionId) {
      metafield(namespace: "custom", key: "brand_info_footer") {
        reference {
          ... on Metaobject {
            id
          }
        }
      }
    }
  }
`;

const UPDATE_METAOBJECT = `
  mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Create a new Collection Brand Info metaobject
const CREATE_METAOBJECT = `
  mutation($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface PushCollectionBody {
  collectionId: string;
  headerHtml: string;
  seoTitle?: string;
  metaDesc?: string;
  footerHeading?: string;
  footerHtml?: string;
}

// ── Handler ──

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SHOPIFY_TOKEN) {
    return NextResponse.json(
      { error: "SHOPIFY_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  let body: PushCollectionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { collectionId, headerHtml, seoTitle, metaDesc, footerHeading, footerHtml } = body;

  if (!collectionId || !headerHtml) {
    return NextResponse.json(
      { error: "Missing required fields: collectionId, headerHtml" },
      { status: 400 }
    );
  }

  try {
    // Step 1: Update collection header + SEO
    const input: Record<string, unknown> = {
      id: collectionId,
      descriptionHtml: headerHtml,
    };

    const seo: { title?: string; description?: string } = {};
    if (seoTitle) seo.title = seoTitle;
    if (metaDesc) seo.description = metaDesc;
    if (Object.keys(seo).length > 0) input.seo = seo;

    const updateResult = await shopifyGraphQL(UPDATE_COLLECTION, { input });
    const { collection, userErrors } = updateResult.data.collectionUpdate;

    if (userErrors && userErrors.length > 0) {
      return NextResponse.json(
        { error: "Shopify rejected the update", detail: userErrors },
        { status: 422 }
      );
    }

    // Step 2: Set copy_last_updated metafield to today's date
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const metafieldResult = await shopifyGraphQL(SET_METAFIELD, {
      metafields: [
        {
          ownerId: collection.id,
          namespace: "custom",
          key: "copy_last_updated",
          type: "date",
          value: today,
        },
      ],
    });

    const mfErrors = metafieldResult?.data?.metafieldsSet?.userErrors;
    const metafieldOk = !mfErrors || mfErrors.length === 0;
    if (!metafieldOk) {
      console.log("[push-collection] Metafield errors:", mfErrors);
    }

    // Step 3: Update or create footer metaobject (if footer content provided)
    let footerOk = false;
    let footerCreated = false;
    if (footerHeading || footerHtml) {
      // Find the existing footer metaobject linked to this collection
      const footerQuery = await shopifyGraphQL(GET_FOOTER_METAOBJECT, {
        collectionId: collection.id,
      });

      let metaobjectId =
        footerQuery?.data?.collection?.metafield?.reference?.id;

      if (metaobjectId) {
        // Update the existing metaobject
        const fields: Array<{ key: string; value: string }> = [];
        if (footerHeading) {
          fields.push({ key: "heading", value: footerHeading });
        }
        if (footerHtml) {
          fields.push({ key: "brand_info", value: footerHtml });
        }

        const moResult = await shopifyGraphQL(UPDATE_METAOBJECT, {
          id: metaobjectId,
          metaobject: { status: "ACTIVE", fields },
        });

        const moErrors = moResult?.data?.metaobjectUpdate?.userErrors;
        footerOk = !moErrors || moErrors.length === 0;
        if (!footerOk) {
          console.log("[push-collection] Metaobject update errors:", moErrors);
        }
      } else {
        // No metaobject linked — create one and link it to the collection
        console.log("[push-collection] No footer metaobject found — creating one");

        const fields: Array<{ key: string; value: string }> = [];
        if (footerHeading) {
          fields.push({ key: "heading", value: footerHeading });
        }
        if (footerHtml) {
          fields.push({ key: "brand_info", value: footerHtml });
        }

        // Create the metaobject with ACTIVE status
        const createResult = await shopifyGraphQL(CREATE_METAOBJECT, {
          metaobject: {
            type: "collection_brand_info",
            status: "ACTIVE",
            fields,
          },
        });

        const createErrors = createResult?.data?.metaobjectCreate?.userErrors;
        if (createErrors && createErrors.length > 0) {
          console.log("[push-collection] Metaobject create errors:", createErrors);
        } else {
          metaobjectId = createResult?.data?.metaobjectCreate?.metaobject?.id;
          footerCreated = true;

          if (metaobjectId) {
            // Link the new metaobject to the collection via brand_info_footer metafield
            const linkResult = await shopifyGraphQL(SET_METAFIELD, {
              metafields: [
                {
                  ownerId: collection.id,
                  namespace: "custom",
                  key: "brand_info_footer",
                  type: "metaobject_reference",
                  value: metaobjectId,
                },
              ],
            });

            const linkErrors = linkResult?.data?.metafieldsSet?.userErrors;
            footerOk = !linkErrors || linkErrors.length === 0;
            if (!footerOk) {
              console.log("[push-collection] Metafield link errors:", linkErrors);
            } else {
              console.log(`[push-collection] Created and linked footer metaobject ${metaobjectId}`);
            }
          }
        }
      }
    }

    // Success response
    const numericId = collection.id.split("/").pop();
    return NextResponse.json({
      success: true,
      collection: {
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        liveUrl: `https://racycles.com/collections/${collection.handle}`,
        adminUrl: `https://admin.shopify.com/store/${SHOPIFY_STORE}/collections/${numericId}`,
      },
      seo: {
        title: seoTitle || null,
        metaDesc: metaDesc || null,
      },
      copyLastUpdated: {
        set: metafieldOk,
        value: today,
      },
      footer: {
        updated: footerOk,
        created: footerCreated,
        provided: !!(footerHeading || footerHtml),
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
