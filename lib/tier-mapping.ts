/**
 * Product type → content tier mapping.
 * Source: "product types.csv" — Troy's definitive tier classification.
 *
 * Tier 1: Bikes & Wheels (700-1000 words)
 * Tier 2: Apparel, Shoes, Helmets, Groupsets, Trainers (400-600 words)
 * Tier 3: Components, Mid-Level Parts (200-400 words)
 * Tier 4: Small Accessories, Tools, Consumables (50-200 words)
 */

export type Tier = 1 | 2 | 3 | 4;

export interface TierConfig {
  label: string;
  thinBelow: number;   // word count below = "Thin"
  goodAbove: number;    // word count at or above = "Good"
  requiredH3: number;   // minimum <h3> sections expected
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  1: { label: "Tier 1 (Bikes/Wheels)", thinBelow: 350, goodAbove: 700, requiredH3: 3 },
  2: { label: "Tier 2 (Apparel/Shoes/Helmets)", thinBelow: 200, goodAbove: 400, requiredH3: 2 },
  3: { label: "Tier 3 (Components/Parts)", thinBelow: 100, goodAbove: 200, requiredH3: 1 },
  4: { label: "Tier 4 (Accessories/Tools)", thinBelow: 25, goodAbove: 50, requiredH3: 0 },
};

// Excluded product types — skip during audit
export const EXCLUDED_TYPES = new Set(["service", "cpb_hybrid_temp"]);

// Case-insensitive product type → tier map
const TIER_MAP: Record<string, Tier> = {
  // ── TIER 1: Bikes & Wheels ──
  "clincher wheels": 1, "e-bikes": 1, "gravel bikes": 1, "mountain bikes": 1,
  "road bikes": 1, "track bikes": 1, "triathlon bikes": 1, "tubeless wheels": 1,
  "tubular wheels": 1, "urban bikes": 1, "wheels": 1,

  // ── TIER 2: Apparel, Shoes, Helmets, Groupsets, Trainers ──
  "aero helmets": 2, "apparel": 2, "arm / leg protectors": 2, "arm / palm carriers": 2,
  "arm warmers": 2, "baselayers": 2, "bib shorts": 2, "bib tights": 2,
  "cassettes": 2, "compression sleeves": 2, "cranks": 2, "cycling computers": 2,
  "cycling socks": 2, "eyewear": 2, "fitness watches": 2, "full faced helmets": 2,
  "gravel shoes": 2, "indoor bikes": 2, "jackets": 2, "jerseys": 2,
  "knee warmers": 2, "knickers": 2, "long sleeve jerseys": 2, "mtb helmets": 2,
  "mtb shoes": 2, "mtb shorts": 2, "mountain bike groupsets": 2,
  "oversized pulleys": 2, "power meter pedals": 2, "power meter spiders": 2,
  "radar systems / lights": 2, "rain jackets": 2, "riding pants": 2,
  "road bike groupsets": 2, "road helmets": 2, "road shoes": 2,
  "short sleeve jerseys": 2, "shorts": 2, "skinsuits": 2, "sleeveless jerseys": 2,
  "smart trainers": 2, "tights": 2, "triathlon shoes": 2, "triathlon shorts": 2,
  "triathlon singlets": 2, "triathlon suits": 2, "vests": 2, "youth helmets": 2,

  // ── TIER 3: Components, Mid-Level Parts ──
  "10s cassettes": 3, "10s chains": 3, "11s cassettes": 3, "11s chains": 3,
  "12s cassettes": 3, "12s chains": 3, "12s/13s chains": 3,
  "13s cassettes": 3, "13s chains": 3,
  "1x road cranksets": 3, "2x road cranksets": 3, "3x road cranksets": 3,
  "7s cassettes": 3, "8s cassettes": 3, "8s chains": 3,
  "9s cassettes": 3, "9s chains": 3,
  "aero base bar": 3, "aero brake levers": 3, "aero clip-ons": 3,
  "aero disc brakes / lever kits": 3, "aero one-piece bar": 3,
  "aero water bottle cages": 3, "aero water bottles": 3,
  "aerobar extensions": 3, "aerobar parts / accessories": 3,
  "air pressure gauges": 3, "airtag holder": 3,
  "bb / crankset tools": 3, "bb30 bottom brackets": 3, "bb386 bottom brackets": 3,
  "bb65 bottom brackets": 3, "bb86 bottom brackets": 3, "bb90 bottom brackets": 3,
  "bb92 bottom brackets": 3, "bbright bottom brackets": 3,
  "back packs": 3, "bag": 3, "bar end shifters": 3, "bars": 3,
  "batteries / chargers": 3, "battery mounts / holders": 3,
  "bearings": 3, "bells": 3, "bike cleaning tools": 3, "bike stands": 3,
  "body armor": 3, "body care": 3, "bottom bracket parts": 3, "bottom brackets": 3,
  "brake caliper parts": 3, "brake lever hoods": 3, "brake lever parts": 3,
  "brake tools": 3, "button shifters": 3,
  "cable locks": 3, "cantilever brake calipers": 3, "caps": 3,
  "car rack parts": 3, "cargo racks": 3, "cassette / freewheel tools": 3,
  "cassette parts": 3, "chain guides": 3, "chain links / pins": 3,
  "chain locks": 3, "chain lube and grease": 3, "chain tools": 3,
  "chainguides": 3, "chainring": 3, "chainring bolts and accessories": 3,
  "chainrings - emtb": 3, "chainrings - mtb": 3,
  "chamois crème": 3, "chews": 3, "chucks": 3,
  "cleaners": 3, "cleaning kits": 3, "cleat covers": 3, "cleat shims / wedges": 3,
  "clincher tires": 3, "coffee": 3,
  "color accent - headsets": 3, "color accent - other": 3,
  "color accent - seat post clamps": 3, "combination lights": 3,
  "commuter bags": 3, "computer mounts": 3, "computer sensors": 3,
  "crank arms": 3, "crank spiders": 3, "crankset parts / accessories": 3,
  "cross brake levers": 3, "cross levers": 3,
  "cycling caps": 3, "cycling computer parts": 3,
  "direct-mount brake calipers": 3, "disc-brake road forks": 3,
  "dropper post": 3, "dropper seat post remotes": 3, "dropper seatposts": 3,
  "dual-pivot brake calipers": 3, "duffel bags": 3,
  "e-bike batteries / extenders": 3, "e-bike displays": 3, "e-bike motor parts": 3,
  "facemasks": 3, "fenders": 3, "floor pumps": 3,
  "frame specific seatposts": 3, "frameset protection": 3,
  "front lights": 3, "gloves": 3,
  "gravel bars": 3, "gravel chainrings": 3, "gravel saddles": 3,
  "hand pumps": 3, "handlebars": 3, "hard cases": 3,
  "heart rate monitors": 3, "high powered lights": 3,
  "hitch-mounted bike racks": 3, "hoodies / sweaters": 3,
  "leg warmers": 3, "long finger gloves": 3,
  "mtb chainrings": 3, "mtb clipless pedals": 3, "mtb cranksets": 3,
  "mtb disc brakes / lever kits": 3, "mtb front derailleurs": 3,
  "mtb rear derailleurs": 3, "mtb saddles": 3,
  "mtb shifter parts / accessories": 3, "mtb shifters": 3, "mtb stems": 3,
  "mountain bike levers": 3, "mountain handlebars": 3,
  "osbb bottom brackets": 3, "one-piece road bars": 3,
  "other pressfit bottom brackets": 3, "pedals": 3,
  "power meter chainrings": 3, "power meter crank arms": 3,
  "power meter cranksets": 3, "pressfit 30 bottom brackets": 3,
  "pressure washers": 3, "pulleys": 3,
  "rear lights": 3, "rear suspension": 3,
  "rim-brake calipers": 3, "rim-brake road forks": 3, "rims": 3,
  "road bars": 3, "road chainrings": 3, "road clipless pedals": 3,
  "road disc brake lever": 3, "road disc brakes / shift lever kits": 3,
  "road disc brakes / shift levers": 3, "road disc brakes calipers": 3,
  "road front derailleurs": 3, "road rear derailleurs": 3,
  "road rim brakes / shift levers set": 3, "road saddles": 3,
  "road shifters for hydraulic brakes": 3, "road shifters for mechanical brakes": 3,
  "road stems": 3, "rollers": 3, "roof rack parts": 3, "roof racks": 3,
  "rotors": 3, "seatposts": 3, "short finger gloves": 3,
  "side-entry bottle cages": 3, "single speed chains": 3, "single speed cogs": 3,
  "skewers": 3, "socks": 3, "soft cases": 3, "stems": 3,
  "suspension forks": 3, "t45 bottom brackets": 3, "t47 bottom brackets": 3,
  "threaded bottom brackets": 3, "threaded headsets": 3, "threadless headsets": 3,
  "thru-axles": 3, "tires": 3,
  "track bars": 3, "track chainrings": 3, "track cranksets": 3,
  "track hubs": 3, "track pedals": 3, "trail socks": 3,
  "triathlon saddles": 3, "tubeless tires": 3, "tubular tires": 3,
  "urban helmets": 3, "urban saddles": 3, "v-brake calipers": 3,
  "vintage saddles": 3,

  // ── TIER 4: Small Accessories, Tools, Consumables ──
  "co2 cartridges": 4, "co2 inflator": 4,
  "cable cutters": 4, "cable housing / parts": 4, "cable routing tools": 4,
  "cleats": 4, "decals": 4, "degreasers": 4,
  "derailleur hangers": 4, "derailleur parts": 4, "detergents": 4,
  "disc brake parts": 4, "disc wheel valves": 4, "disc-brake pads": 4,
  "dropper seatposts parts": 4, "electronic wiring": 4,
  "frame bags": 4, "frame specific spare parts": 4,
  "freehub bodies": 4, "freehub parts": 4, "freestanding bike racks": 4,
  "freewheels": 4, "fuel belts": 4, "gels": 4,
  "greases": 4, "greases / oils": 4, "grips": 4, "grips and tape": 4,
  "handlebar accessories": 4, "handlebar bags": 4,
  "handlebar bottle cage mounts / systems": 4, "handlebar tape": 4,
  "headbands": 4, "headgear": 4, "headphones": 4,
  "headset / bar adapters": 4, "headset parts": 4, "headset tools": 4,
  "hex tools": 4, "hub parts": 4, "hubs": 4, "hydration bags": 4,
  "hydraulic brake cables/parts": 4, "inner tubes": 4,
  "insoles": 4, "insulated water bottles": 4,
  "integrated headsets": 4, "interfaces / controllers": 4,
  "kickstands": 4, "laces": 4, "lighting mounts / accessories": 4,
  "lockrings": 4, "lubricants": 4, "mtb hubs": 4,
  "mechanical brake cables": 4, "mechanical derailleur cables": 4,
  "mirrors": 4, "multi-purpose tools": 4,
  "off-road water bottles": 4, "oils / fluids": 4,
  "on bike accessories": 4, "other accessories": 4, "other components": 4,
  "parts": 4, "pedal parts": 4, "pedal wrenches": 4,
  "phone mounts": 4, "platform pedals": 4, "polo's": 4,
  "powder mixes": 4, "power meter parts / accessories": 4, "preloaders": 4,
  "race number belts": 4, "rain caps": 4,
  "rear suspension spare parts": 4, "replacement parts": 4,
  "replacement valves": 4, "rim tape": 4, "rim-brake pads": 4,
  "road hubs": 4, "run caps": 4, "run safety": 4,
  "run shorts": 4, "run tanks": 4, "run tees": 4, "run tops": 4,
  "running pouches": 4, "running shoes": 4, "running socks": 4,
  "saddle accessories": 4, "saddle bags": 4,
  "saddle bottle cage mounts / systems": 4,
  "seatpost clamps / wedges": 4, "seatpost parts": 4,
  "shock pumps": 4, "shoe booties": 4, "shoe covers": 4,
  "shoe parts / accessories": 4, "skin protection / repair": 4, "skull caps": 4,
  "spare parts for road forks": 4, "spare parts for suspension forks": 4,
  "spare parts for wheels": 4, "specialty locks": 4,
  "spoke nipples": 4, "spoke wrenches": 4, "spokes": 4,
  "standard water bottle cages": 4, "standard water bottles": 4,
  "steerer tube spacers": 4, "stem parts": 4, "storage bottles": 4,
  "swim caps": 4, "swim goggles": 4, "swim shorts": 4,
  "swim tops": 4, "swim training": 4, "swimming bags": 4, "swimsuits": 4,
  "tablets / capsules": 4, "tee": 4, "tee's": 4,
  "tire liners": 4, "tire pressure monitors": 4, "tire repair tools": 4,
  "toe clips": 4, "toe covers": 4, "tools": 4,
  "top tube bags": 4, "torque wrenches": 4, "torx tools": 4, "tote bag": 4,
  "trainer accessories": 4, "trainer mats": 4,
  "transition bags": 4, "travel cases parts / accessories": 4,
  "triathlon race necesities": 4,
  "tubeless": 4, "tubeless rim tape": 4, "tubeless sealant": 4,
  "tubeless valves": 4, "tubular glue / tape": 4,
  "u-locks": 4, "urban accessories": 4,
  "v-brake or threaded brake pads": 4, "valve extenders": 4,
  "visors": 4, "waffles": 4, "wall mounted bike racks": 4, "wallets": 4,
  "warmers": 4, "water bottle": 4,
  "water bottle cage parts / accessories": 4, "water bottles": 4,
  "wetsuits": 4, "wheel bags": 4, "wheelset tools": 4,
  "workstands": 4, "wrenches": 4,
};

/**
 * Get the content tier for a product type.
 * Falls back to Tier 3 if the product type isn't mapped.
 */
export function getContentTier(productType: string): Tier {
  const key = (productType || "").trim().toLowerCase();
  if (!key) return 3;
  return TIER_MAP[key] ?? 3;
}

/**
 * Check if a product type should be excluded from audit.
 */
export function isExcluded(productType: string): boolean {
  const key = (productType || "").trim().toLowerCase();
  return EXCLUDED_TYPES.has(key);
}
