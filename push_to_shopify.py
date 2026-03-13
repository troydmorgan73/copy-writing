"""
Push a product description, SEO title, and meta description to Shopify.

This script is called by Claude after the copywriter approves a description.
It updates the product by its Shopify GID (no handle lookup needed) with the
body HTML, SEO title, and meta description in one GraphQL mutation.

Usage: Claude runs this inline — no CLI args needed.
       Set PRODUCT_ID, HTML_CONTENT, SEO_TITLE, META_DESC before calling main().
       Optionally set HANDLE for fallback lookup if no product ID is available.
"""

# ── AUTO-INSTALL ─────────────────────────────────────────────
import subprocess, sys

def _ensure_packages(*packages):
    for pkg in packages:
        try:
            __import__(pkg.split("==")[0].replace("-", "_"))
        except ImportError:
            print(f"Installing {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])

_ensure_packages("requests", "python-dotenv")

# ── IMPORTS ──────────────────────────────────────────────────
import os
import requests
from dotenv import load_dotenv

load_dotenv()

# ── CONFIG ───────────────────────────────────────────────────
RAW_STORE = os.getenv("SHOPIFY_SHOP_NAME", "")
SHOPIFY_STORE = RAW_STORE.replace(".myshopify.com", "")
SHOPIFY_TOKEN = os.getenv("SHOPIFY_ACCESS_TOKEN")
API_VERSION = os.getenv("SHOPIFY_API_VERSION", "2025-10")

GRAPHQL_URL = f"https://{SHOPIFY_STORE}.myshopify.com/admin/api/{API_VERSION}/graphql.json"
HEADERS = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": SHOPIFY_TOKEN,
}

# ── These get set by Claude before calling main() ────────────
PRODUCT_ID = ""      # e.g., "gid://shopify/Product/1234567890" — preferred
HANDLE = ""          # e.g., "scott-foil-rc-20-bike" — fallback if no ID
HTML_CONTENT = ""    # Full product description HTML
SEO_TITLE = ""       # e.g., "Scott Foil RC 20 Bike | RA Cycles"
META_DESC = ""       # e.g., "The Scott Foil RC 20 brings aero performance..."


# ── GRAPHQL QUERIES ──────────────────────────────────────────

LOOKUP_QUERY = """
query($handle: String!) {
  productByHandle(handle: $handle) {
    id
    title
    handle
  }
}
"""

UPDATE_MUTATION = """
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
"""


# ── MAIN ─────────────────────────────────────────────────────

def main():
    # Validate config
    if not SHOPIFY_TOKEN:
        print("ERROR: SHOPIFY_ACCESS_TOKEN not found in .env file")
        print("Add it to your .env or .env.local file and try again.")
        sys.exit(1)

    if not PRODUCT_ID and not HANDLE:
        print("ERROR: No product ID or handle specified.")
        sys.exit(1)

    if not HTML_CONTENT:
        print("ERROR: No HTML content specified.")
        sys.exit(1)

    # Step 1: Resolve product ID
    product_gid = PRODUCT_ID

    if product_gid:
        # Direct ID path — no lookup needed
        print(f"Using product ID: {product_gid}")
    else:
        # Fallback: look up by handle
        print(f"No product ID — looking up by handle: {HANDLE}...")
        resp = requests.post(
            GRAPHQL_URL,
            json={"query": LOOKUP_QUERY, "variables": {"handle": HANDLE}},
            headers=HEADERS,
        )
        resp.raise_for_status()
        data = resp.json()

        if "errors" in data:
            print(f"ERROR: GraphQL errors: {data['errors']}")
            sys.exit(1)

        product = data["data"]["productByHandle"]
        if not product:
            print(f"ERROR: No product found with handle '{HANDLE}'")
            print(f"Check the handle and try again.")
            sys.exit(1)

        product_gid = product["id"]
        print(f"Found: {product['title']} ({product_gid})")

    # Step 2: Update product
    print("Pushing to Shopify...")
    input_data = {
        "id": product_gid,
        "descriptionHtml": HTML_CONTENT,
    }

    # Only include SEO fields if provided
    seo = {}
    if SEO_TITLE:
        seo["title"] = SEO_TITLE
    if META_DESC:
        seo["description"] = META_DESC
    if seo:
        input_data["seo"] = seo

    resp = requests.post(
        GRAPHQL_URL,
        json={"query": UPDATE_MUTATION, "variables": {"input": input_data}},
        headers=HEADERS,
    )
    resp.raise_for_status()
    result = resp.json()

    if "errors" in result:
        print(f"ERROR: GraphQL errors: {result['errors']}")
        sys.exit(1)

    update_result = result["data"]["productUpdate"]
    errors = update_result["userErrors"]

    if errors:
        print(f"ERROR: Shopify rejected the update:")
        for err in errors:
            print(f"  {err['field']}: {err['message']}")
        sys.exit(1)

    # Success
    updated = update_result["product"]
    pid = updated["id"].split("/")[-1]
    print(f"\nPushed to Shopify: {updated['title']}")
    print(f"  Live: https://racycles.com/products/{updated['handle']}")
    print(f"  Admin: https://admin.shopify.com/store/{SHOPIFY_STORE}/products/{pid}")
    if SEO_TITLE:
        print(f"  SEO Title: {SEO_TITLE}")
    if META_DESC:
        print(f"  Meta Desc: {META_DESC[:80]}...")
    print("\nDone!")


if __name__ == "__main__":
    main()
