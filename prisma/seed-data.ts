/**
 * Seed data and the seeding routine.
 *
 * This module is imported by two callers, which is the only reason it is
 * separate from `seed.ts`:
 *
 *   1. `prisma/seed.ts`, the CLI, which builds a Prisma client from
 *      `DATABASE_URL` and calls `seedDatabase`.
 *   2. `src/lib/demo-db.ts`, which runs the same seed against an in-process
 *      PGlite instance so a deployed demo has data without a database server.
 *
 * It exports a function rather than executing at import time. A module that
 * seeds on import cannot be reused by a second caller without re-seeding, and
 * it would also seed during a production build, which is not a thing anyone
 * wants to discover.
 *
 * Note the `dotenv/config` import in the CLI: `tsx` does not load `.env` the
 * way Next.js does, and without it `DATABASE_URL` would be undefined and the
 * `pg` adapter would silently fall back to localhost:5432 -- connecting to the
 * wrong port with a confusing "connection refused" rather than a clear config
 * error.
 */
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Zone } from "../src/generated/prisma/enums";
import { hash } from "bcryptjs";
import { zonedTimeToUtc } from "../src/lib/datetime";

const TIMEZONE = "Europe/London";
const DURATION_MIN = 90;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, dateStyle: "short" })
  .format(new Date())
  .replace(/(\d{4})-(\d{2})-(\d{2})/, "$1-$2-$3");

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6, matching `dayKeyForDate`. */
function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
}

// ---------------------------------------------------------------------------
// Floor plan — 11 tables across three zones, 52 covers.
// ---------------------------------------------------------------------------

const SECTIONS = [
  { name: "Main dining room", zone: "INDOOR" as Zone },
  { name: "Garden terrace", zone: "OUTDOOR" as Zone },
  { name: "The alcove", zone: "PRIVATE" as Zone },
];

const TABLES = [
  // Main dining room
  { number: 1, capacity: 2, zone: "INDOOR" as Zone, section: 0 },
  { number: 2, capacity: 2, zone: "INDOOR" as Zone, section: 0 },
  { number: 3, capacity: 4, zone: "INDOOR" as Zone, section: 0 },
  { number: 4, capacity: 4, zone: "INDOOR" as Zone, section: 0 },
  { number: 5, capacity: 4, zone: "INDOOR" as Zone, section: 0 },
  { number: 6, capacity: 6, zone: "INDOOR" as Zone, section: 0 },
  { number: 7, capacity: 8, zone: "INDOOR" as Zone, section: 0 },
  // Garden terrace
  { number: 8, capacity: 2, zone: "OUTDOOR" as Zone, section: 1 },
  { number: 9, capacity: 4, zone: "OUTDOOR" as Zone, section: 1 },
  { number: 10, capacity: 6, zone: "OUTDOOR" as Zone, section: 1 },
  // Private alcove
  { number: 11, capacity: 10, zone: "PRIVATE" as Zone, section: 2 },
];

// ---------------------------------------------------------------------------
// Menu — 24 dishes with descriptions written in the restaurant's voice.
// ---------------------------------------------------------------------------

type Seed = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  category: "STARTERS" | "MAINS" | "DESSERTS" | "DRINKS";
  imageUrl: string;
  tags: string[];
  ingredients: string[];
  allergens: string[];
  calories: number;
  isSignature: boolean;
  chefNote?: string;
};

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

const MENU: Seed[] = [
  // ---- Starters ----
  {
    slug: "burrata-cherry-tomato",
    name: "Burrata, cherry tomato, basil oil",
    description:
      "Puglian burrata torn open at the table, over heritage tomatoes from the walled garden, with basil oil and a crust of grilled sourdough.",
    priceCents: 1250,
    category: "STARTERS",
    imageUrl: img("1625944525533-473f1a3d54e7"),
    tags: ["VEGETARIAN", "GLUTEN_FREE"],
    ingredients: ["Burrata", "Heritage tomatoes", "Basil", "Sourdough", "Olive oil"],
    allergens: ["Milk", "Gluten"],
    calories: 420,
    isSignature: true,
    chefNote: "The tomatoes come from a walled garden two miles north. In August they are picked that morning.",
  },
  {
    slug: "octopus-tender",
    name: "Charred octopus, chickpea, smoked paprika",
    description:
      "Octopus grilled over charcoal until the edges catch, with a chickpea and smoked paprika purée, confit garlic and lemon.",
    priceCents: 1600,
    category: "STARTERS",
    imageUrl: img("1565299507177-b0ac66763828"),
    tags: ["GLUTEN_FREE", "SPICY"],
    ingredients: ["Octopus", "Chickpeas", "Smoked paprika", "Garlic", "Lemon"],
    allergens: ["Molluscs"],
    calories: 380,
    isSignature: true,
  },
  {
    slug: "courgette-flower",
    name: "Courgette flower, ricotta, hot honey",
    description:
      "Stuffed with whipped ricotta and pine nut, crisped at the edges, finished with chilli honey and a squeeze of lemon.",
    priceCents: 1100,
    category: "STARTERS",
    imageUrl: img("1540420773420-3366772f4999"),
    tags: ["VEGETARIAN"],
    ingredients: ["Courgette", "Ricotta", "Pine nuts", "Chilli honey"],
    allergens: ["Milk", "Nuts"],
    calories: 290,
    isSignature: false,
  },
  {
    slug: "lamb-croquette",
    name: "Lamb shoulder croquette, harissa",
    description:
      "Slow-cooked lamb shoulder bound with breadcrumbs, fried to order, with rose harissa and a cool yoghurt.",
    priceCents: 1150,
    category: "STARTERS",
    imageUrl: img("1544025162-d76694265947"),
    tags: ["SPICY"],
    ingredients: ["Lamb shoulder", "Harissa", "Yoghurt", "Breadcrumbs"],
    allergens: ["Milk", "Gluten"],
    calories: 520,
    isSignature: false,
  },
  {
    slug: "beetroot-tartare",
    name: "Beetroot tartare, capers, rye",
    description:
      "Cured garden beetroot diced finely with capers and cornichon, on a rye cracker, with dill and mustard.",
    priceCents: 1050,
    category: "STARTERS",
    imageUrl: img("1512621776951-a57141f2eefd"),
    tags: ["VEGAN", "DAIRY_FREE"],
    ingredients: ["Beetroot", "Capers", "Rye", "Dill", "Mustard"],
    allergens: ["Gluten", "Sulphites"],
    calories: 210,
    isSignature: false,
  },
  {
    slug: "scallops-cauliflower",
    name: "Roast scallops, cauliflower, brown butter",
    description:
      "Hand-dived scallops seared on one side, with cauliflower purée, brown butter and a crisp of rye crumb.",
    priceCents: 1750,
    category: "STARTERS",
    imageUrl: img("1559847844-5315695dadae"),
    tags: ["GLUTEN_FREE"],
    ingredients: ["Scallops", "Cauliflower", "Brown butter", "Rye crumb"],
    allergens: ["Milk", "Molluscs", "Gluten"],
    calories: 340,
    isSignature: true,
  },

  // ---- Mains ----
  {
    slug: "seabass-verde",
    name: "Roast seabass, salsa verde, butterbeans",
    description:
      "Whole roast seabass with a caper and parsley salsa verde, creamy butterbeans, and fennel shaved raw with citrus.",
    priceCents: 3200,
    category: "MAINS",
    imageUrl: img("1519708227418-c8fd9a32b7a2"),
    tags: ["GLUTEN_FREE"],
    ingredients: ["Seabass", "Butterbeans", "Parsley", "Caper", "Fennel"],
    allergens: ["Fish", "Milk"],
    calories: 620,
    isSignature: true,
    chefNote: "We cook the fish on the bone and fillet it at the pass. It takes four minutes longer and it is worth every second.",
  },
  {
    slug: "duck-confit",
    name: "Duck leg confit, sour cherry, celeriac",
    description:
      "Twelve-hour confit with a sour cherry gastrique, salt-baked celeriac, and watercress.",
    priceCents: 2900,
    category: "MAINS",
    imageUrl: img("1547592180-85f173990554"),
    tags: ["GLUTEN_FREE"],
    ingredients: ["Duck leg", "Sour cherry", "Celeriac", "Watercress"],
    allergens: ["Celery", "Sulphites"],
    calories: 780,
    isSignature: true,
  },
  {
    slug: "cavolo-nero-rigatoni",
    name: "Cavolo nero, ricotta, lemon rigatoni",
    description:
      "Pasta folded with cavolo nero, whipped ricotta and lemon zest, finished with bronze crumb and a hard sear of chilli.",
    priceCents: 2100,
    category: "MAINS",
    imageUrl: img("1473093295043-cdd812d0e601"),
    tags: ["VEGETARIAN", "SPICY"],
    ingredients: ["Rigatoni", "Cavolo nero", "Ricotta", "Lemon", "Chilli"],
    allergens: ["Gluten", "Milk"],
    calories: 690,
    isSignature: true,
  },
  {
    slug: "beef-fillet",
    name: "Dry-aged beef fillet, bone marrow, watercress",
    description:
      "Forty-day dry-aged fillet, marrow butter, watercress and a deep-fried shallot. Aged thirty-five days, minimum.",
    priceCents: 4200,
    category: "MAINS",
    imageUrl: img("1546964124-0cce460f38ef"),
    tags: ["GLUTEN_FREE"],
    ingredients: ["Beef fillet", "Bone marrow", "Watercress", "Shallot"],
    allergens: ["Milk", "Celery", "Sulphites"],
    calories: 840,
    isSignature: true,
  },
  {
    slug: "aubergine-bistecca",
    name: "Aubergine bistecca, chickpea miso",
    description:
      "A whole aubergine grilled over flame, cut thick, with chickpea miso, pickled walnut and shiso.",
    priceCents: 1950,
    category: "MAINS",
    imageUrl: img("1543339308-43e59d6b73a6"),
    tags: ["VEGAN", "DAIRY_FREE"],
    ingredients: ["Aubergine", "Chickpea miso", "Walnut", "Shiso"],
    allergens: ["Nuts", "Soya"],
    calories: 410,
    isSignature: false,
  },
  {
    slug: "chicken-smoked-almond",
    name: "Free-range chicken, smoked almond, grape",
    description:
      "Butter-poasted chicken with a smoked almond and grape salsa, bitter leaves and a chicken jus sharpened with sherry.",
    priceCents: 2650,
    category: "MAINS",
    imageUrl: img("1532550907401-a500c9a57435"),
    tags: ["GLUTEN_FREE"],
    ingredients: ["Chicken", "Almond", "Grape", "Sherry"],
    allergens: ["Nuts", "Sulphites"],
    calories: 720,
    isSignature: false,
  },
  {
    slug: "lamb-shank",
    name: "Slow lamb shank, saffron, black garlic",
    description:
      "Braised for six hours with saffron and black garlic, with saffron potato and charred hispi cabbage.",
    priceCents: 3400,
    category: "MAINS",
    imageUrl: img("1603360946369-dc9bb6258143"),
    tags: [],
    ingredients: ["Lamb shank", "Saffron", "Black garlic", "Hispi cabbage"],
    allergens: ["Sulphites"],
    calories: 890,
    isSignature: false,
  },
  {
    slug: "mushroom-venison",
    name: "Venison, wild mushroom, chestnut",
    description:
      "Roast venison loin with a wild mushroom ragù, braised chestnut and quince, with parsnip crisped in butter.",
    priceCents: 3800,
    category: "MAINS",
    imageUrl: img("1600891964092-4316c288032e"),
    tags: ["GLUTEN_FREE"],
    ingredients: ["Venison", "Mushroom", "Chestnut", "Quince", "Parsnip"],
    allergens: ["Celery", "Sulphites", "Milk"],
    calories: 810,
    isSignature: false,
  },
  {
    slug: "squid-ink-pasta",
    name: "Squid ink tagliolini, crab, citrus",
    description:
      "Black tagliolini with crab claw meat, a fine cut of citrus, bottarga and bronze crumb.",
    priceCents: 2800,
    category: "MAINS",
    imageUrl: img("1563379926898-05f4575a45d8"),
    tags: ["SPICY"],
    ingredients: ["Tagliolini", "Squid ink", "Crab", "Bottarga", "Orange"],
    allergens: ["Crustaceans", "Molluscs", "Fish", "Gluten", "Egg"],
    calories: 700,
    isSignature: true,
  },
  {
    slug: "butternut-squash",
    name: "Butternut squash, sage, hazelnut orzo",
    description:
      "Roast squash with sage brown butter, hazelnut orzo, whipped goat's cheese and a hazelnut praline.",
    priceCents: 1850,
    category: "MAINS",
    imageUrl: img("1505253716362-afaea1d3d1af"),
    tags: ["VEGETARIAN"],
    ingredients: ["Butternut squash", "Sage", "Hazelnut", "Goat's cheese"],
    allergens: ["Milk", "Nuts", "Gluten"],
    calories: 560,
    isSignature: false,
  },

  // ---- Desserts ----
  {
    slug: "olive-oil-cake",
    name: "Olive oil cake, crème fraîche, fig",
    description:
      "A damp, citrus-scented cake using the oil we cook with all year, with crème fraîche and a poached fig.",
    priceCents: 900,
    category: "DESSERTS",
    imageUrl: img("1578985545062-69928b1d9587"),
    tags: ["VEGETARIAN"],
    ingredients: ["Olive oil", "Orange", "Fig", "Crème fraîche"],
    allergens: ["Milk", "Egg", "Gluten"],
    calories: 460,
    isSignature: true,
  },
  {
    slug: "chocolate-tart",
    name: "Dark chocolate tart, sea salt, crème fraîche",
    description:
      "Seventy per cent chocolate in a sable biscuit base, with Maldon salt and a spoon of crème fraîche.",
    priceCents: 950,
    category: "DESSERTS",
    imageUrl: img("1606313564200-e75d5e30476c"),
    tags: ["VEGETARIAN"],
    ingredients: ["Dark chocolate", "Sable biscuit", "Sea salt", "Crème fraîche"],
    allergens: ["Milk", "Egg", "Gluten", "Soya"],
    calories: 520,
    isSignature: true,
  },
  {
    slug: "panna-cotta",
    name: "Vanilla panna cotta, rhubarb, shortbread",
    description:
      "Madagascan vanilla set lightly, with poached Yorkshire rhubarb and a shortbread to dunk.",
    priceCents: 850,
    category: "DESSERTS",
    imageUrl: img("1488477181946-6428a0291777"),
    tags: ["VEGETARIAN"],
    ingredients: ["Vanilla", "Rhubarb", "Shortbread"],
    allergens: ["Milk", "Gluten"],
    calories: 440,
    isSignature: false,
  },
  {
    slug: "affogato",
    name: "Affogato, amaretto, sesame brittle",
    description:
      "Espresso poured over vanilla ice cream with amaretto and a shard of sesame brittle for something to bite on.",
    priceCents: 800,
    category: "DESSERTS",
    imageUrl: img("1551024506-0bccd828d307"),
    tags: ["VEGETARIAN"],
    ingredients: ["Espresso", "Vanilla ice cream", "Amaretto", "Sesame"],
    allergens: ["Milk", "Sesame", "Nuts", "Egg"],
    calories: 380,
    isSignature: false,
  },

  // ---- Drinks ----
  {
    slug: "house-white",
    name: "House white — Picpoul de Pinet",
    description:
      "The glass most people finish. Pale, saline, and crisp enough to reset the palate between courses.",
    priceCents: 750,
    category: "DRINKS",
    imageUrl: img("1506377247377-2a5b3b417ebb"),
    tags: ["VEGAN", "GLUTEN_FREE"],
    ingredients: ["Picpoul de Pinet", "Languedoc"],
    allergens: ["Sulphites"],
    calories: 120,
    isSignature: false,
  },
  {
    slug: "house-red",
    name: "House red — Côtes du Rhône",
    description:
      "A soft, generous red with black cherry and pepper. Our most-reordered bottle, by some distance.",
    priceCents: 780,
    category: "DRINKS",
    imageUrl: img("1553361371-9b22f78e8b1d"),
    tags: ["VEGAN", "GLUTEN_FREE"],
    ingredients: ["Grenache", "Syrah", "Rhône"],
    allergens: ["Sulphites"],
    calories: 130,
    isSignature: false,
  },
  {
    slug: "sherry-cobijada",
    name: "Sherry — Cobijada, Sanlúcar",
    description:
      "Aged fino-style sherry, briny and startling. Served in its own glass, well chilled.",
    priceCents: 850,
    category: "DRINKS",
    imageUrl: img("1510812431401-41d2bd2722f3"),
    tags: ["VEGAN", "GLUTEN_FREE"],
    ingredients: ["Palomino", "Sanlúcar"],
    allergens: ["Sulphites"],
    calories: 110,
    isSignature: false,
  },
  {
    slug: "negroni",
    name: "Savora Negroni",
    description:
      "Equal parts gin, our own blood-orange vermouth, and Campari. Built over one clear cube, stirred for exactly twenty seconds.",
    priceCents: 1200,
    category: "DRINKS",
    imageUrl: img("1551024709-8f23befc6f87"),
    tags: ["VEGAN", "GLUTEN_FREE"],
    ingredients: ["Gin", "Blood orange vermouth", "Campari"],
    allergens: ["Sulphites"],
    calories: 160,
    isSignature: true,
  },
  {
    slug: "elderflower-spritz",
    name: "Elderflower spritz, prosecco, cucumber",
    description:
      "House elderflower cordial, prosecco, cucumber and a sprig of mint. Our alcohol-free answer that nobody misses the alcohol in.",
    priceCents: 950,
    category: "DRINKS",
    imageUrl: img("1556679343-c7306c1976bc"),
    tags: ["VEGAN", "GLUTEN_FREE"],
    ingredients: ["Elderflower", "Prosecco", "Cucumber", "Mint"],
    allergens: ["Sulphites"],
    calories: 90,
    isSignature: false,
  },
  {
    slug: "sparkling-water",
    name: "Sparkling water, 750ml bottle",
    description: "Cold, and more of it than you think you need. Served in its own bottle.",
    priceCents: 500,
    category: "DRINKS",
    imageUrl: img("1523362628745-0c100150b504"),
    tags: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
    ingredients: ["Mineral water"],
    allergens: [],
    calories: 0,
    isSignature: false,
  },
];

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const CUSTOMERS = [
  {
    name: "Elena Marchetti",
    email: "elena.marchetti@example.com",
    phone: "+44 7700 900112",
    staffNotes: "Allergic to tree nuts — severe. Flag to kitchen on every booking.",
  },
  {
    name: "James Whitfield",
    email: "j.whitfield@example.com",
    phone: "+44 7700 900334",
    staffNotes: "Anniversary every year around 10 June. Prefers the terrace in summer.",
  },
  {
    name: "Priya Raghunathan",
    email: "priya.r@example.com",
    phone: "+44 7700 900567",
    staffNotes: "Vegetarian. Loves the cavolo nero rigatoni — suggests it to everyone.",
  },
  {
    name: "Tom Ashworth",
    email: "t.ashworth@example.com",
    phone: "+44 7700 900778",
    staffNotes: "Regular, usually 19:30, table for two.",
  },
  {
    name: "Sofia Almeida",
    email: "sofia.almeida@example.com",
    phone: "+44 7700 900990",
    staffNotes: "Booking for her parents — prefers a quiet table away from the door.",
  },
  {
    name: "Daniel Okonkwo",
    email: "d.okonkwo@example.com",
    phone: "+44 7700 900221",
    staffNotes: "None.",
  },
];

/**
 * Seeds an already-migrated database.
 *
 * The caller owns the schema. This function owns the data: it truncates the
 * tables it is about to repopulate and writes a coherent, realistic dataset.
 * `NewsletterSubscriber` is deliberately left alone -- those are real addresses
 * collected from real people, not demo data, and a re-seed should not silently
 * unsubscribe anybody.
 */
export async function seedDatabase(prisma: PrismaClient) {
  console.log("seeding Savora…");

  // Wipe in dependency order. `TRUNCATE ... CASCADE` is far faster than
  // deleting row by row and guarantees no orphans.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Favorite", "Reservation", "MenuItem",
      "RestaurantTable", "FloorSection",
      "Session", "Account", "VerificationToken", "User",
      "RestaurantSettings"
    RESTART IDENTITY CASCADE
  `);

  // The rate-limit table is deliberately *not* created here. It used to be, with
  // `CREATE TABLE IF NOT EXISTS`, which meant a fresh database had no rate
  // limiter until the seed happened to finish -- and `prisma db push` dropped it
  // outright, since Prisma has no model for it. It is a migration now.

  // ---- Settings ----
  // `openingHours` is jsonb, which Prisma 7 cannot type, so the scalar columns
  // go through Prisma and the hours are written with one parameterised raw
  // statement. See src/lib/settings-repo.ts for the same split on the read side.
  await prisma.restaurantSettings.create({
    data: {
      id: 1,
      name: "Savora",
      tagline: "Seasonal Mediterranean cooking in the heart of the city",
      address: "18 Alder Lane, Colchester, CO1 1SP",
      phone: "+44 1206 555 0188",
      email: "reservations@savora.example",
      holidays: [],
      maxPartySize: 12,
      bookingWindowDays: 30,
      diningDurationMin: DURATION_MIN,
      holdDurationMin: 10,
      minNoticeHours: 2,
      timezone: TIMEZONE,
      currency: "GBP",
      isAcceptingReservations: true,
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE "RestaurantSettings" SET "openingHours" = $1::jsonb WHERE "id" = 1`,
    JSON.stringify({
      mon: [],
      tue: [["18:00", "22:00"]],
      wed: [["18:00", "22:00"]],
      thu: [["12:00", "14:30"], ["18:00", "22:00"]],
      fri: [["12:00", "14:30"], ["18:00", "23:00"]],
      sat: [["12:00", "15:00"], ["18:00", "23:00"]],
      sun: [["12:00", "16:00"]],
    }),
  );
  console.log("  settings");

  // ---- Floor plan ----
  const sections = await Promise.all(
    SECTIONS.map((s, i) =>
      prisma.floorSection.create({ data: { ...s, sortOrder: i } }),
    ),
  );
  const tables = await Promise.all(
    TABLES.map((t) =>
      prisma.restaurantTable.create({
        data: { number: t.number, capacity: t.capacity, zone: t.zone, sectionId: sections[t.section].id },
      }),
    ),
  );
  const totalCovers = TABLES.reduce((sum, t) => sum + t.capacity, 0);
  console.log(`  floor plan — ${TABLES.length} tables, ${totalCovers} covers`);

  // ---- Menu ----
  await prisma.menuItem.createMany({
    data: MENU.map((m, i) => ({
      slug: m.slug,
      name: m.name,
      description: m.description,
      priceCents: m.priceCents,
      category: m.category as never,
      imageUrl: m.imageUrl,
      tags: m.tags as never,
      ingredients: m.ingredients,
      allergens: m.allergens,
      calories: m.calories,
      isSignature: m.isSignature,
      chefNote: m.chefNote ?? null,
      sortOrder: i,
      isAvailable: true,
    })),
  });
  // Two dishes sold out, so the menu shows that state without any setup.
  await prisma.menuItem.update({ where: { slug: "affogato" }, data: { isSoldOut: true } });
  await prisma.menuItem.update({
    where: { slug: "elderflower-spritz" },
    data: { isSoldOut: true },
  });
  console.log(`  menu — ${MENU.length} dishes`);

  // ---- Users ----
  const adminPassword = await hash(process.env.SEED_ADMIN_PASSWORD ?? "savora-admin", 10);
  const guestPassword = await hash(process.env.SEED_CUSTOMER_PASSWORD ?? "savora-guest", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Nadia Farouk",
      email: (process.env.SEED_ADMIN_EMAIL ?? "admin@savora.example").toLowerCase(),
      password: adminPassword,
      phone: "+44 1206 555 0188",
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });
  console.log(`  admin — ${admin.email} / ${process.env.SEED_ADMIN_PASSWORD ?? "savora-admin"}`);

  const demoCustomer = await prisma.user.create({
    data: {
      name: "Elena Marchetti",
      email: (process.env.SEED_CUSTOMER_EMAIL ?? "guest@savora.example").toLowerCase(),
      password: guestPassword,
      phone: "+44 7700 900112",
      role: "CUSTOMER",
      emailVerified: new Date(),
      staffNotes: "Allergic to tree nuts — severe. Flag to kitchen on every booking.",
    },
  });
  console.log(`  customer — ${demoCustomer.email} / ${process.env.SEED_CUSTOMER_PASSWORD ?? "savora-guest"}`);

  const customers = [];
  for (const c of CUSTOMERS) {
    customers.push(
      await prisma.user.create({
        data: {
          name: c.name,
          email: c.email,
          phone: c.phone,
          staffNotes: c.staffNotes,
          role: "CUSTOMER",
          password: guestPassword,
          emailVerified: new Date(),
        },
      }),
    );
  }
  console.log(`  customers — ${customers.length}`);

  // ---- Reservations ----
  /**
   * Demand curve, by weekday, as a count of bookings per service. Chosen to
   * look like a real independent: quiet Monday, a steady Tuesday and
   * Wednesday, and a Friday and Saturday that fill up. This is what makes the
   * admin dashboard and the analytics meaningful rather than uniformly random.
   */
  const DEMAND: Record<number, { lunch: number[]; dinner: number[] }> = {
    0: { lunch: [], dinner: [] }, // Monday — closed
    1: { lunch: [], dinner: [1, 2, 2, 3] }, // Tuesday
    2: { lunch: [], dinner: [1, 2, 2, 2, 3] }, // Wednesday
    3: { lunch: [1, 2], dinner: [2, 2, 3] }, // Thursday
    4: { lunch: [2, 2, 3], dinner: [3, 4, 4, 3] }, // Friday
    5: { lunch: [2, 3, 2], dinner: [4, 4, 3, 2] }, // Saturday
    6: { lunch: [1, 2], dinner: [] }, // Sunday
  };

  const OCCASIONS = ["Birthday", "Anniversary", null, null, null, "Business dinner", "Date night", null];
  const REQUESTS = [
    "Window seat if one is free.",
    "One guest is gluten free.",
    "Celebrating a birthday — a candle would be lovely.",
    "We will need a high chair for our daughter.",
    null,
    "Could we have the quieter table away from the door?",
    null,
  ];

  let created = 0;
  let confirmedCount = 0;
  let completedCount = 0;
  let noShowCount = 0;
  let seed = 20260101;

  /** Deterministic PRNG so the seed produces the same floor plan every run. */
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  /**
   * Confirmation codes must be unique (there is a unique index on them), and a
   * seeded random draw will eventually collide across ~200 bookings. A counter
   * with a base-32 alphabet keeps them short, readable, and collision-free.
   */
  const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  let codeCounter = 0;
  const nextCode = () => {
    let n = codeCounter++;
    let code = "";
    for (let i = 0; i < 6; i++) {
      code = CODE_ALPHABET[n % CODE_ALPHABET.length] + code;
      n = Math.floor(n / CODE_ALPHABET.length);
    }
    return `S${code}`;
  };

  let tokenCounter = 0;
  const nextToken = () => {
    // Two interleaved counters produce a 24-char hex-ish token, unique by
    // construction within the seed run.
    tokenCounter++;
    return `${(tokenCounter * 2654435761).toString(16).padStart(8, "0")}${(tokenCounter * 40503)
      .toString(16)
      .padStart(8, "0")}`;
  };

  // -21 days history through +13 days ahead.
  for (let offset = -21; offset <= 13; offset++) {
    const date = shiftDays(TODAY, offset);
    const day = weekday(date);
    const demand = DEMAND[day];
    if (!demand) continue;

    for (const [serviceIndex, times] of demand.lunch.map((t, i) => [i, t] as const).concat(demand.dinner.map((t, i) => [i + 1, t] as const))) {
      const base = serviceIndex === 0 ? 12 * 60 : 18 * 60;
      for (let i = 0; i < times; i++) {
        // Stagger seatings so they do not all share a start time.
        const minute = base + i * 30 + (rand() > 0.5 ? 15 : 0);
        const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

        const startsAt = zonedTimeToUtc(date, time, TIMEZONE);
        const endsAt = new Date(startsAt.getTime() + DURATION_MIN * 60_000);
        // Past services are kept (as COMPLETED / NO_SHOW) so the admin
        // dashboard and the customer's "past visits" list have real history to
        // render. Only bookings whose start is still in the future are skipped,
        // since a PENDING booking in the past would be nonsense.

        const person = customers[Math.floor(rand() * customers.length)];
        const partySize = 1 + Math.floor(rand() * 6);

        // Choose a table that fits and is free, mimicking the real assignment
        // path. Retries bound the work in the tightest services.
        let chosen: (typeof tables)[number] | null = null;
        for (let attempt = 0; attempt < 14 && !chosen; attempt++) {
          const fitting = tables
            .filter((t) => t.capacity >= partySize)
            .sort((a, b) => a.capacity - b.capacity);
          const pick = fitting[Math.floor(rand() * fitting.length)];
          if (!pick) break;
          const clash = await prisma.reservation.findFirst({
            where: {
              tableId: pick.id,
              status: { in: ["PENDING", "CONFIRMED", "SEATED", "COMPLETED"] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { id: true },
          });
          if (!clash) chosen = pick;
        }
        if (!chosen) continue;

        // Historical services get a terminal status; anything still to come
        // stays CONFIRMED so it is a live, cancellable booking.
        const isPast = startsAt.getTime() < Date.now();
        const status = isPast
          ? rand() > 0.12
            ? "COMPLETED"
            : "NO_SHOW"
          : "CONFIRMED";

        const isDemoUser = rand() > 0.78;
        const guest = isDemoUser ? demoCustomer : person;

        // A booking created after the fact is impossible, so backdate
        // `createdAt` for past visits to just before the service.
        const createdAt = new Date(
          startsAt.getTime() - (3 + Math.floor(rand() * 20)) * 86_400_000,
        );

        await prisma.reservation.create({
          data: {
            date: new Date(`${date}T00:00:00.000Z`),
            time,
            startsAt,
            endsAt,
            partySize,
            status: status as never,
            zonePref: null,
            guestName: guest.name ?? "Guest",
            guestEmail: guest.email,
            guestPhone: guest.phone,
            userId: guest.id,
            tableId: chosen.id,
            confirmationCode: nextCode(),
            manageToken: nextToken(),
            occasion: OCCASIONS[Math.floor(rand() * OCCASIONS.length)] ?? null,
            specialRequests: REQUESTS[Math.floor(rand() * REQUESTS.length)] ?? null,
            createdAt,
          },
        });
        created++;
        if (status === "CONFIRMED") confirmedCount++;
        if (status === "COMPLETED") completedCount++;
        if (status === "NO_SHOW") noShowCount++;
      }
    }
  }
  console.log(
    `  reservations — ${created} total ` +
      `(${confirmedCount} upcoming, ${completedCount} completed, ${noShowCount} no-show)`,
  );

  // ---- Favourites ----
  const favouritesForDemo = ["seabass-verde", "cavolo-nero-rigatoni", "chocolate-tart", "negroni"];
  const items = await prisma.menuItem.findMany({ where: { slug: { in: favouritesForDemo } } });
  await prisma.favorite.createMany({
    data: items.map((i) => ({ userId: demoCustomer.id, menuItemId: i.id })),
  });
  console.log(`  favourites — ${items.length} saved to ${demoCustomer.email}`);

  console.log("\nSeed complete.");
  console.log("  Admin:    " + admin.email);
  console.log("  Customer: " + demoCustomer.email);
}


