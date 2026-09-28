/**
 * Synthetic data only. Deterministic, so screenshots and tests are stable.
 * No production record, and no real person, is ever loaded into this stack.
 */
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString });

const FIRST = ["Amara", "Ben", "Chiara", "Divya", "Eitan", "Fumiko", "Grace", "Hassan", "Ingrid", "Jonas", "Keiko", "Liam", "Mira", "Noor", "Otto", "Priya", "Quentin", "Rosa", "Sven", "Tariq"];
const LAST = ["Adeyemi", "Bauer", "Conti", "Deshmukh", "Eriksen", "Fujita", "Garcia", "Haddad", "Iversen", "Johansson", "Kimura", "Lindqvist", "Moreau", "Nasser", "Olsen", "Patel", "Quirke", "Ramos", "Strand", "Tanaka"];
const REGIONS = [
  { region: "EMEA", countries: ["DE", "FR", "GB", "AE", "ZA"], cities: ["Berlin", "Lyon", "Leeds", "Dubai", "Cape Town"] },
  { region: "AMER", countries: ["US", "CA", "BR", "MX"], cities: ["Austin", "Toronto", "Recife", "Puebla"] },
  { region: "APAC", countries: ["JP", "SG", "AU", "IN"], cities: ["Osaka", "Singapore", "Perth", "Pune"] },
];

/** Deterministic pseudo-random so the dataset is reproducible across runs. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const rand = rng(20260928);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;

await pool.query(
  "truncate dsar_requests, kyc_documents, kyc_cases, customer_notes, customers restart identity cascade",
);

const CUSTOMER_COUNT = 120;
const customerIds: { id: string; region: string }[] = [];

for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
  const bucket = pick(REGIONS);
  const countryIndex = Math.floor(rand() * bucket.countries.length);
  const first = pick(FIRST);
  const last = pick(LAST);
  const reference = `CUS-${String(10_000 + i)}`;
  const year = 1955 + Math.floor(rand() * 50);
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  const status = rand() < 0.86 ? "active" : rand() < 0.6 ? "suspended" : "closed";
  const riskTier = rand() < 0.75 ? "standard" : rand() < 0.93 ? "enhanced" : "prohibited";

  const { rows } = await pool.query<{ id: string }>(
    `insert into customers
       (reference, full_name, email, phone, date_of_birth, national_id, address_line, city,
        country_code, region, status, risk_tier)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     returning id`,
    [
      reference,
      `${first} ${last}`,
      `${first.toLowerCase()}.${last.toLowerCase()}${i}@example-synthetic.test`,
      `+1-555-${String(1000 + Math.floor(rand() * 8999))}`,
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      `SYN-${String(Math.floor(rand() * 900_000_000) + 100_000_000)}`,
      `${1 + Math.floor(rand() * 200)} Example Street`,
      bucket.cities[countryIndex] ?? "Berlin",
      bucket.countries[countryIndex] ?? "DE",
      bucket.region,
      status,
      riskTier,
    ],
  );
  const id = rows[0]!.id;
  customerIds.push({ id, region: bucket.region });

  if (rand() < 0.4) {
    await pool.query(`insert into customer_notes (customer_id, author_email, body) values ($1,$2,$3)`, [
      id,
      "support.agent@example-synthetic.test",
      pick([
        "Customer called about a delayed payout; explained settlement window.",
        "Address change requested, evidence pending.",
        "Duplicate account suspected, merged reference recorded.",
        "Requested statement export for the last quarter.",
      ]),
    ]);
  }
}

const DOC_TYPES = ["passport", "national_id", "proof_of_address", "selfie"] as const;
let caseIndex = 0;
for (const customer of customerIds) {
  if (rand() > 0.55) continue;
  caseIndex += 1;
  const roll = rand();
  const status = roll < 0.45 ? "pending" : roll < 0.6 ? "in_review" : roll < 0.8 ? "approved" : roll < 0.93 ? "rejected" : "escalated";
  const decided = status === "approved" || status === "rejected";
  const { rows } = await pool.query<{ id: string }>(
    `insert into kyc_cases (reference, customer_id, status, risk_score, decided_at, decided_by, decision_reason)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [
      `KYC-${String(50_000 + caseIndex)}`,
      customer.id,
      status,
      Math.floor(rand() * 101),
      decided ? new Date(Date.now() - Math.floor(rand() * 30) * 86_400_000) : null,
      decided ? "kyc.reviewer@example-synthetic.test" : null,
      decided ? (status === "approved" ? "Documents verified against sanctions and PEP screening." : "Document quality insufficient after two requests.") : null,
    ],
  );
  const caseId = rows[0]!.id;
  const docCount = 2 + Math.floor(rand() * 3);
  for (let d = 0; d < docCount; d += 1) {
    await pool.query(
      `insert into kyc_documents (case_id, doc_type, verification_state) values ($1,$2,$3)`,
      [caseId, DOC_TYPES[d % DOC_TYPES.length], rand() < 0.65 ? "verified" : rand() < 0.8 ? "pending" : "failed"],
    );
  }
}

const DSAR_TYPES = ["access", "erasure", "correction", "portability"] as const;
let dsarIndex = 0;
for (const customer of customerIds) {
  if (rand() > 0.3) continue;
  dsarIndex += 1;
  const roll = rand();
  const status = roll < 0.4 ? "open" : roll < 0.6 ? "in_progress" : roll < 0.88 ? "fulfilled" : "refused";
  const closed = status === "fulfilled" || status === "refused";
  const receivedDaysAgo = Math.floor(rand() * 45);
  const received = new Date(Date.now() - receivedDaysAgo * 86_400_000);
  await pool.query(
    `insert into dsar_requests
       (reference, customer_id, request_type, status, received_at, due_at, closed_at, closed_by, resolution_note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      `DSR-${String(70_000 + dsarIndex)}`,
      customer.id,
      pick(DSAR_TYPES),
      status,
      received,
      new Date(received.getTime() + 30 * 86_400_000),
      closed ? new Date(received.getTime() + Math.floor(rand() * 20) * 86_400_000) : null,
      closed ? "dana.steward@example-synthetic.test" : null,
      closed
        ? status === "fulfilled"
          ? "Export delivered through the secure channel after identity verification."
          : "Refused: retention obligation under AML rules overrides erasure."
        : null,
    ],
  );
}

const counts = await pool.query<{ customers: string; cases: string; dsars: string }>(
  `select (select count(*) from customers) as customers,
          (select count(*) from kyc_cases) as cases,
          (select count(*) from dsar_requests) as dsars`,
);
console.log(
  `seeded ${counts.rows[0]?.customers} customers, ${counts.rows[0]?.cases} KYC cases and ${counts.rows[0]?.dsars} data subject requests (synthetic)`,
);
await pool.end();
