"""
Push Cannondale Habit LTD product description to Shopify.

Pre-filled and ready to run — just hit the Run button in VS Code.
Updates body HTML, SEO title, and meta description in one shot.
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

# ── PRODUCT DATA (pre-filled by Claude) ─────────────────────
PRODUCT_ID = "gid://shopify/Product/7626009739308"
HANDLE = "cannondale-habit-ltd-bike"
SEO_TITLE = "Cannondale Habit LTD Bike | RA Cycles"
META_DESC = "The Cannondale Habit LTD features BallisTec carbon, size-tuned Proportional Response suspension, SRAM XO AXS T-Type, and DT Swiss carbon wheels."

HTML_CONTENT = """\
<div>
  <p>The <strong>Cannondale Habit LTD Bike</strong> is the kind of trail bike that makes you rethink what 130 millimeters of rear travel can do. Built around Cannondale's BallisTec carbon frame and paired with a 140mm RockShox Pike Ultimate fork, the Habit LTD sits in that sweet spot between aggressive trail riding and all-day efficiency \u2014 a bike that climbs with purpose and descends with more composure than the travel numbers suggest. This is Cannondale's flagship trail build, and every component choice on this carbon trail bike reflects that status. On your local trails, the Habit LTD rewards the kind of rider who reads terrain and carries speed through transitions rather than relying on travel alone to bail them out.</p>

  <p>What sets the Habit LTD apart from other trail mountain bikes starts at the frame itself. Cannondale's Proportional Response suspension design doesn't just scale the frame dimensions to fit different riders \u2014 it repositions the suspension pivot points and adjusts the linkage layout for each frame size. A size small gets a fundamentally different suspension kinematic than a size large, which means the bike's pedaling efficiency, bump absorption, and progression are tuned to the leverage and weight distribution of the rider who actually fits that frame. It's an approach that requires more engineering work at every size, but the payoff is a bike that feels dialed whether you're 5'4" or 6'2". The BallisTec carbon layup keeps the frame light and responsive, with a stiffness profile designed to transfer power efficiently on climbs while still offering enough compliance to keep the rear end tracking through rough terrain.</p>

  <p>The build kit reinforces the frame's intent at every contact point. SRAM's XO Eagle AXS T-Type drivetrain delivers wireless electronic shifting with the T-Type direct-mount derailleur design that tucks the cage closer to the cassette for a cleaner profile and better protection on rocky terrain. DT Swiss XMC 1501 carbon wheels with 240 hubs keep the rotating weight low and the engagement instant \u2014 these are wheels that respond the moment you put power down. A RockShox Reverb AXS wireless dropper post completes the cable-free cockpit, and SRAM G2 RSC four-piston brakes provide the stopping power this bike's capability demands. Up front, the HollowGram SAVE carbon bar adds a measure of vibration damping on long, chattery descents.</p>

  <h3>Cannondale Habit LTD Specs at a Glance</h3>
  <ul class="specs_at_a_glance">
    <li><strong>Frame:</strong> BallisTec carbon, Proportional Response suspension, 130mm rear travel</li>
    <li><strong>Fork:</strong> RockShox Pike Ultimate, Charger 3 RC2 damper, 140mm travel</li>
    <li><strong>Shock:</strong> RockShox Deluxe Ultimate, trunnion mount</li>
    <li><strong>Drivetrain:</strong> SRAM XO Eagle AXS T-Type, 12-speed wireless</li>
    <li><strong>Wheels:</strong> DT Swiss XMC 1501 carbon, 240 hubs, 29"</li>
    <li><strong>Brakes:</strong> SRAM G2 RSC, 4-piston hydraulic</li>
    <li><strong>Cockpit:</strong> HollowGram SAVE carbon handlebar</li>
    <li><strong>Dropper:</strong> RockShox Reverb AXS, wireless</li>
    <li><strong>Tires:</strong> Maxxis Dissector 2.4" front / Rekon 2.4" rear</li>
  </ul>

  <h3>Design Benefits</h3>
  <ol class="design_benefits">
    <li><strong>Proportional Response Suspension:</strong> Rather than simply scaling one suspension design across sizes, Cannondale engineers distinct pivot placements and linkage ratios for each frame size. The result is consistent ride quality and pedaling efficiency across the entire size range \u2014 your suspension works the way it was designed to, regardless of whether you're on the smallest or largest frame.</li>
    <li><strong>Cable-Free Cockpit:</strong> The combination of SRAM AXS electronic shifting and the Reverb AXS wireless dropper means zero shift or dropper cables running to the handlebar. Beyond the clean aesthetic, this simplifies maintenance, eliminates cable drag, and gives the HollowGram SAVE carbon bar room to do its job absorbing trail vibration without cable routing constraints.</li>
    <li><strong>Carbon Wheels with Premium Hubs:</strong> The DT Swiss XMC 1501 wheelset pairs a stiff, lightweight carbon rim with DT Swiss 240 hubs \u2014 one of the most reliable hub platforms in mountain biking. The low rotational weight improves acceleration and climbing efficiency, while the 240 hub's ratchet engagement means instant power transfer when you stamp on the pedals out of a corner.</li>
    <li><strong>Trail-Tuned Tire Strategy:</strong> Maxxis Dissector up front provides aggressive cornering grip and braking traction, while the Rekon rear rolls faster with lower rolling resistance. It's a proven front-rear combination for trail riding \u2014 maximum control where you need it, less drag where you don't.</li>
  </ol>

  <h3>Final Take</h3>
  <p>The Cannondale Habit LTD is built for the trail rider who values precision as much as capability. With its size-tuned suspension, wireless everything, and a wheelset that punches well above what most trail bikes carry at any price, the Habit LTD delivers a ride that's both refined and ready for whatever your local trails throw at it. It's a bike that rewards skilled riding without punishing you on the long climb home.</p>
</div>"""

# ── GRAPHQL ──────────────────────────────────────────────────

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

    print(f"Product:   Cannondale Habit LTD Bike")
    print(f"ID:        {PRODUCT_ID}")
    print(f"SEO Title: {SEO_TITLE}")
    print(f"Meta Desc: {META_DESC[:60]}...")
    print()
    print("Pushing to Shopify...")

    input_data = {
        "id": PRODUCT_ID,
        "descriptionHtml": HTML_CONTENT,
        "seo": {
            "title": SEO_TITLE,
            "description": META_DESC,
        },
    }

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
        print("ERROR: Shopify rejected the update:")
        for err in errors:
            print(f"  {err['field']}: {err['message']}")
        sys.exit(1)

    # Success
    updated = update_result["product"]
    pid = updated["id"].split("/")[-1]
    print()
    print(f"Pushed to Shopify: {updated['title']}")
    print(f"  Live:  https://racycles.com/products/{updated['handle']}")
    print(f"  Admin: https://admin.shopify.com/store/{SHOPIFY_STORE}/products/{pid}")
    print()
    print("Done!")


if __name__ == "__main__":
    main()
