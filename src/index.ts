import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";

const worker = new Worker();
export default worker;

type VerificationStatus =
  | "verified"
  | "needs_review"
  | "unverified"
  | "unsupported_country";

type WebsiteMatch = "exact" | "partial" | "mismatch" | "unknown";

type SourceDefinition = {
  key: string;
  label: string;
  countries: string[];
  coverageNote: string;
  live: boolean;
  requiresEnv: string | null;
};

type VerificationResult = {
  verificationStatus: VerificationStatus;
  confidence: number;
  selectedSource: string;
  matchedName: string | null;
  matchedCountryCode: string | null;
  registryName: string | null;
  registryId: string | null;
  officialStatus: string | null;
  websiteMatch: WebsiteMatch;
  attemptedSources: string[];
  evidenceUrls: string[];
  riskFlags: string[];
  notes: string[];
};

type VerifyInput = {
  name: string;
  countryCode: string | null;
  website: string | null;
  registrationNumber: string | null;
};

const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    key: "findCharityUS",
    label: "ProPublica Nonprofit Explorer v2",
    countries: ["US"],
    coverageNote: "IRS-exempt organizations in the United States.",
    live: true,
    requiresEnv: null,
  },
  {
    key: "findCharityUK",
    label: "CharityBase GraphQL",
    countries: ["GB", "UK"],
    coverageNote:
      "Best for England and Wales via Charity Commission-backed data in CharityBase.",
    live: true,
    requiresEnv: "CHARITYBASE_API_KEY",
  },
  {
    key: "findCharityCA",
    label: "CRA Charity Listings",
    countries: ["CA"],
    coverageNote:
      "Planned: best implemented as periodic CSV ingest or a dedicated adapter.",
    live: false,
    requiresEnv: null,
  },
  {
    key: "findCharityAU",
    label: "ABN Lookup + ACNC",
    countries: ["AU"],
    coverageNote:
      "Planned: combine legal-entity identity from ABN with charity status from ACNC.",
    live: false,
    requiresEnv: null,
  },
  {
    key: "findCharityNZ",
    label: "Charities Services OData",
    countries: ["NZ"],
    coverageNote: "Planned: direct registry lookup for New Zealand charities.",
    live: false,
    requiresEnv: null,
  },
  {
    key: "findCharityIE",
    label: "Ireland Charities Regulator",
    countries: ["IE"],
    coverageNote: "Recommended next source for Ireland coverage.",
    live: false,
    requiresEnv: null,
  },
  {
    key: "findCharityIN",
    label: "NGO Darpan + FCRA",
    countries: ["IN"],
    coverageNote:
      "Recommended next source for India, especially for foreign-funding checks.",
    live: false,
    requiresEnv: null,
  },
  {
    key: "findCharityCZ",
    label: "ARES economic entities API",
    countries: ["CZ"],
    coverageNote:
      "Czech public registry API for legal-entity existence and status via ARES.",
    live: true,
    requiresEnv: null,
  },
  {
    key: "findCharityIL",
    label: "Israel amutot and halatz open data",
    countries: ["IL"],
    coverageNote:
      "Ministry of Justice open datasets for associations and public benefit companies.",
    live: true,
    requiresEnv: null,
  },
  {
    key: "findCharityBR",
    label: "OpenCNPJ public API",
    countries: ["BR"],
    coverageNote:
      "Public CNPJ data useful for Brazilian nonprofit legal-entity verification.",
    live: true,
    requiresEnv: null,
  },
  {
    key: "findCharityHK",
    label: "Hong Kong IRD Section 88 CSV",
    countries: ["HK"],
    coverageNote:
      "Official Inland Revenue Department Section 88 charity list in CSV format.",
    live: true,
    requiresEnv: null,
  },
  {
    key: "findCharityTW",
    label: "Taiwan nonprofit public CSV",
    countries: ["TW"],
    coverageNote:
      "Ministry of Finance nonprofit dataset for registered nonprofit entities.",
    live: true,
    requiresEnv: null,
  },
  {
    key: "findCharityUA",
    label: "Ukraine non-profit tax registry API",
    countries: ["UA"],
    coverageNote:
      "Official Ukrainian nonprofit registry API; requires a user-generated tax cabinet token.",
    live: true,
    requiresEnv: "UKRAINE_TAX_TOKEN",
  },
  {
    key: "findCharityMX",
    label: "SAT Donatarias open reports",
    countries: ["MX"],
    coverageNote:
      "SAT publishes machine-readable reports for authorized donees; this adapter uses the latest available open CSV report.",
    live: true,
    requiresEnv: null,
  },
];

const sourceSummarySchema = j.object({
  key: j.string(),
  label: j.string(),
  coverageNote: j.string(),
  live: j.boolean(),
  requiresEnv: j.string().nullable(),
});

const verificationOutputSchema = j.object({
  verificationStatus: j.enum(
    "verified",
    "needs_review",
    "unverified",
    "unsupported_country",
  ),
  confidence: j.number(),
  selectedSource: j.string(),
  matchedName: j.string().nullable(),
  matchedCountryCode: j.string().nullable(),
  registryName: j.string().nullable(),
  registryId: j.string().nullable(),
  officialStatus: j.string().nullable(),
  websiteMatch: j.enum("exact", "partial", "mismatch", "unknown"),
  attemptedSources: j.array(j.string()),
  evidenceUrls: j.array(j.string()),
  riskFlags: j.array(j.string()),
  notes: j.array(j.string()),
});

worker.tool<VerifyInput, VerificationResult>("verifyNonprofit", {
  title: "Verify Nonprofit",
  description:
    "Verify a nonprofit against country-specific registry sources and return a normalized result.",
  schema: j.object({
    name: j.string().describe("Organization name to verify."),
    countryCode: j
      .string()
      .nullable()
      .describe("Two-letter country code when known, such as US, GB, CA, AU, or NZ."),
    website: j
      .string()
      .nullable()
      .describe("Claimed organization website, if available."),
    registrationNumber: j
      .string()
      .nullable()
      .describe("Known charity number, EIN, or registry identifier if available."),
  }),
  outputSchema: verificationOutputSchema,
  hints: {
    readOnlyHint: true,
  },
  execute: async (input) => verifyNonprofit(input),
});

worker.tool("listVerificationCoverage", {
  title: "List Verification Coverage",
  description:
    "Show which countries and source adapters are live, planned, or require credentials.",
  schema: j.object({
    countryCode: j
      .string()
      .nullable()
      .describe("Optional country code to filter the source list."),
  }),
  outputSchema: j.object({
    countryCode: j.string().nullable(),
    sources: j.array(sourceSummarySchema),
    notes: j.array(j.string()),
  }),
  hints: {
    readOnlyHint: true,
  },
  execute: async ({ countryCode }) => {
    const normalized = normalizeCountryCode(countryCode);
    const sources = normalized
      ? SOURCE_DEFINITIONS.filter((source) =>
          source.countries.includes(normalized),
        ).map(toSourceSummary)
      : SOURCE_DEFINITIONS.map(toSourceSummary);

    return {
      countryCode: normalized,
      sources,
      notes: normalized
        ? [`Coverage filtered to ${normalized}.`]
        : [
            "Live adapters currently include US, UK, CZ, IL, BR, HK, TW, and MX. Ukraine is available when UKRAINE_TAX_TOKEN is configured.",
            "UK lookups require CHARITYBASE_API_KEY in the worker environment.",
          ],
    };
  },
});

function toSourceSummary(source: SourceDefinition) {
  return {
    key: source.key,
    label: source.label,
    coverageNote: source.coverageNote,
    live: source.live,
    requiresEnv: source.requiresEnv,
  };
}

async function verifyNonprofit(input: VerifyInput): Promise<VerificationResult> {
  const normalizedCountry = normalizeCountryCode(input.countryCode);
  const claimedDomain = extractHostname(input.website);
  const attemptedSources: string[] = [];
  const notes: string[] = [];

  const selectedSources = normalizedCountry
    ? SOURCE_DEFINITIONS.filter((source) =>
        source.countries.includes(normalizedCountry),
      )
    : [];

  if (!normalizedCountry) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.28,
      selectedSource: "routing",
      matchedName: null,
      matchedCountryCode: null,
      registryName: null,
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls: [],
      riskFlags: [],
      notes: [
        "Country code is required for reliable routing in the current worker version.",
        "Future versions can infer country from address, website, or legal suffixes.",
      ],
    };
  }

  if (selectedSources.length === 0) {
    return {
      verificationStatus: "unsupported_country",
      confidence: 0.1,
      selectedSource: "none",
      matchedName: null,
      matchedCountryCode: normalizedCountry,
      registryName: null,
      registryId: null,
      officialStatus: null,
      websiteMatch: claimedDomain ? "unknown" : "unknown",
      attemptedSources,
      evidenceUrls: [],
      riskFlags: [],
      notes: [
        `No source adapter is registered yet for ${normalizedCountry}.`,
        "Use listVerificationCoverage to inspect live and planned adapters.",
      ],
    };
  }

  for (const source of selectedSources) {
    attemptedSources.push(source.key);

    if (source.requiresEnv && !process.env[source.requiresEnv]) {
      notes.push(
        `${source.label} is available but requires ${source.requiresEnv} in the worker environment.`,
      );
      continue;
    }

    if (!source.live) {
      notes.push(source.coverageNote);
      continue;
    }

    if (source.key === "findCharityUS") {
      return verifyWithProPublica(input, normalizedCountry, attemptedSources, notes);
    }

    if (source.key === "findCharityUK") {
      return verifyWithCharityBase(
        input,
        normalizedCountry,
        attemptedSources,
        notes,
        claimedDomain,
      );
    }

    if (source.key === "findCharityCZ") {
      return verifyWithAres(
        input,
        normalizedCountry,
        attemptedSources,
        notes,
      );
    }

    if (source.key === "findCharityIL") {
      return verifyWithIsraelRegistry(
        input,
        normalizedCountry,
        attemptedSources,
        notes,
      );
    }

    if (source.key === "findCharityBR") {
      return verifyWithOpenCnpj(
        input,
        normalizedCountry,
        attemptedSources,
        notes,
      );
    }

    if (source.key === "findCharityHK") {
      return verifyWithHongKongSection88(
        input,
        normalizedCountry,
        attemptedSources,
        notes,
      );
    }

    if (source.key === "findCharityTW") {
      return verifyWithTaiwanNonprofitCsv(
        input,
        normalizedCountry,
        attemptedSources,
        notes,
      );
    }

    if (source.key === "findCharityUA") {
      return verifyWithUkraineRegistry(
        input,
        normalizedCountry,
        attemptedSources,
        notes,
      );
    }

    if (source.key === "findCharityMX") {
      return verifyWithMexicoDonatarias(
        input,
        normalizedCountry,
        attemptedSources,
        notes,
      );
    }
  }

  return {
    verificationStatus: "needs_review",
    confidence: 0.22,
    selectedSource: attemptedSources[0] ?? "routing",
    matchedName: null,
    matchedCountryCode: normalizedCountry,
    registryName: null,
    registryId: null,
    officialStatus: null,
    websiteMatch: claimedDomain ? "unknown" : "unknown",
    attemptedSources,
    evidenceUrls: [],
    riskFlags: [],
    notes:
      notes.length > 0
        ? notes
        : ["No live adapter could complete this verification request."],
  };
}

async function verifyWithProPublica(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const evidenceUrls: string[] = [];
  const query = sanitizeRegistrationNumber(input.registrationNumber) || input.name;
  const searchUrl = new URL(
    "https://projects.propublica.org/nonprofits/api/v2/search.json",
  );
  searchUrl.searchParams.set("q", query);

  const response = await fetch(searchUrl);
  if (!response.ok) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityUS",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "ProPublica Nonprofit Explorer v2",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, `ProPublica lookup failed with HTTP ${response.status}.`],
    };
  }

  const payload = (await response.json()) as {
    organizations?: Array<{
      ein?: number;
      strein?: string;
      name?: string;
      city?: string;
      state?: string;
      have_filings?: boolean;
      ntee_code?: string;
    }>;
  };

  const organizations = payload.organizations ?? [];
  if (organizations.length === 0) {
    return {
      verificationStatus: "unverified",
      confidence: 0.12,
      selectedSource: "findCharityUS",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "ProPublica Nonprofit Explorer v2",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, "No U.S. nonprofit match was returned by ProPublica."],
    };
  }

  const bestMatch = organizations
    .map((organization) => ({
      organization,
      score: computeNameScore(input.name, organization.name ?? ""),
    }))
    .sort((left, right) => right.score - left.score)[0];

  const match = bestMatch.organization;
  const ein = match.strein ?? String(match.ein ?? "");
  if (ein) {
    evidenceUrls.push(
      `https://projects.propublica.org/nonprofits/organizations/${stripNonDigits(ein)}`,
    );
  }

  const confidence = clamp(
    0.45 +
      bestMatch.score * 0.45 +
      (match.have_filings ? 0.08 : 0) +
      (input.registrationNumber && sameIdentifier(input.registrationNumber, ein)
        ? 0.1
        : 0),
  );

  return {
    verificationStatus:
      confidence >= 0.86
        ? "verified"
        : confidence >= 0.5
          ? "needs_review"
          : "unverified",
    confidence,
    selectedSource: "findCharityUS",
    matchedName: match.name ?? null,
    matchedCountryCode: countryCode,
    registryName: "ProPublica Nonprofit Explorer v2",
    registryId: ein || null,
    officialStatus: match.have_filings
      ? "IRS-exempt organization record present"
      : "Record found but no filings surfaced in search result",
    websiteMatch: "unknown",
    attemptedSources,
    evidenceUrls,
    riskFlags: [],
    notes: [
      ...notes,
      match.ntee_code
        ? `Matched NTEE code ${match.ntee_code}.`
        : "No NTEE code was returned for the top result.",
      match.city && match.state
        ? `Top result location: ${match.city}, ${match.state}.`
        : "Top result did not include a full city/state location.",
    ],
  };
}

async function verifyWithCharityBase(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
  claimedDomain: string | null,
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const evidenceUrls = ["https://charitybase.uk/api/graphql"];
  const query = `
    query VerifyCharity($search: String!) {
      CHC {
        getCharities(filters: { search: $search }) {
          count
          list(limit: 5) {
            id
            names {
              value
              primary
            }
            contact {
              email
              phone
            }
            registrations {
              registrationDate
              removalDate
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://charitybase.uk/api/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Apikey ${process.env.CHARITYBASE_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        search: input.registrationNumber || input.name,
      },
    }),
  });

  if (!response.ok) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityUK",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "CharityBase GraphQL",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, `CharityBase lookup failed with HTTP ${response.status}.`],
    };
  }

  const payload = (await response.json()) as {
    data?: {
      CHC?: {
        getCharities?: {
          list?: Array<{
            id?: string;
            names?: Array<{ value?: string; primary?: boolean }>;
            contact?: { email?: string | null; phone?: string | null };
            registrations?: Array<{
              registrationDate?: string | null;
              removalDate?: string | null;
            }>;
          }>;
        };
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityUK",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "CharityBase GraphQL",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        payload.errors.map((error) => error.message || "Unknown CharityBase error").join("; "),
      ],
    };
  }

  const charities = payload.data?.CHC?.getCharities?.list ?? [];
  if (charities.length === 0) {
    return {
      verificationStatus: "unverified",
      confidence: 0.12,
      selectedSource: "findCharityUK",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "CharityBase GraphQL",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        "No UK charity match was returned by CharityBase.",
        "Current UK adapter is best for England and Wales records.",
      ],
    };
  }

  const bestMatch = charities
    .map((charity) => {
      const primaryName =
        charity.names?.find((name) => name.primary)?.value ||
        charity.names?.[0]?.value ||
        "";

      return {
        charity,
        primaryName,
        score: computeNameScore(input.name, primaryName),
      };
    })
    .sort((left, right) => right.score - left.score)[0];

  const registration = bestMatch.charity.registrations?.[0];
  const emailDomain = extractHostname(bestMatch.charity.contact?.email ?? null);
  const websiteMatch = compareDomains(claimedDomain, emailDomain);
  const confidence = clamp(
    0.42 +
      bestMatch.score * 0.46 +
      (registration?.removalDate ? -0.15 : 0.08) +
      (input.registrationNumber &&
      sameIdentifier(input.registrationNumber, bestMatch.charity.id ?? "")
        ? 0.08
        : 0) +
      (websiteMatch === "exact" ? 0.06 : websiteMatch === "partial" ? 0.03 : 0),
  );

  return {
    verificationStatus:
      confidence >= 0.86
        ? "verified"
        : confidence >= 0.5
          ? "needs_review"
          : "unverified",
    confidence,
    selectedSource: "findCharityUK",
    matchedName: bestMatch.primaryName || null,
    matchedCountryCode: countryCode,
    registryName: "CharityBase GraphQL",
    registryId: bestMatch.charity.id ?? null,
    officialStatus: registration?.removalDate
      ? `Removed from register on ${registration.removalDate}`
      : registration?.registrationDate
        ? `Registered on ${registration.registrationDate}`
        : "Registration record present",
    websiteMatch,
    attemptedSources,
    evidenceUrls,
    riskFlags: [],
    notes: [
      ...notes,
      "UK adapter currently queries CharityBase's CHC dataset.",
      registration?.removalDate
        ? "Top result appears removed from the register."
        : "Top result appears active in CharityBase.",
    ],
  };
}

async function verifyWithAres(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const evidenceUrls: string[] = [];
  const registrationNumber = sanitizeRegistrationNumber(input.registrationNumber);

  if (registrationNumber) {
    const detailUrl = `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${registrationNumber}`;
    evidenceUrls.push(detailUrl);
    const response = await fetchJson<AresEntity | null>(detailUrl);

    if (!response.ok) {
      return {
        verificationStatus: "needs_review",
        confidence: 0.22,
        selectedSource: "findCharityCZ",
        matchedName: null,
        matchedCountryCode: countryCode,
        registryName: "ARES economic entities API",
        registryId: registrationNumber,
        officialStatus: null,
        websiteMatch: "unknown",
        attemptedSources,
        evidenceUrls,
        riskFlags: [],
        notes: [
          ...notes,
          response.errorNote,
        ],
      };
    }

    if (!response.data) {
      return {
        verificationStatus: "needs_review",
        confidence: 0.22,
        selectedSource: "findCharityCZ",
        matchedName: null,
        matchedCountryCode: countryCode,
        registryName: "ARES economic entities API",
        registryId: registrationNumber,
        officialStatus: null,
        websiteMatch: "unknown",
        attemptedSources,
        evidenceUrls,
        riskFlags: [],
        notes: [
          ...notes,
          "ARES detail lookup did not return a usable record.",
        ],
      };
    }

    return buildAresResult(
      input,
      countryCode,
      attemptedSources,
      response.data,
      evidenceUrls,
      notes,
    );
  }

  const searchUrl =
    "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat";
  const searchResponse = await fetchJson<AresSearchResponse>(searchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      obchodniJmeno: input.name,
      start: 0,
      pocet: 5,
    }),
  });

  evidenceUrls.push(searchUrl);
  if (!searchResponse.ok) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.22,
      selectedSource: "findCharityCZ",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "ARES economic entities API",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        searchResponse.errorNote,
      ],
    };
  }

  const matches = searchResponse.data.ekonomickeSubjekty ?? [];
  if (matches.length === 0) {
    return {
      verificationStatus: "unverified",
      confidence: 0.14,
      selectedSource: "findCharityCZ",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "ARES economic entities API",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        "ARES returned no Czech legal entities for the supplied organization name.",
      ],
    };
  }

  const bestMatch = matches
    .map((entity) => ({
      entity,
      score: computeNameScore(input.name, entity.obchodniJmeno ?? ""),
    }))
    .sort((left, right) => right.score - left.score)[0];

  return buildAresResult(
    input,
    countryCode,
    attemptedSources,
    bestMatch.entity,
    evidenceUrls,
    notes,
  );
}

async function verifyWithIsraelRegistry(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const query = input.registrationNumber?.trim() || input.name;
  const amutotUrl = new URL("https://data.gov.il/api/3/action/datastore_search");
  amutotUrl.searchParams.set("resource_id", "be5b7935-3922-45d4-9638-08871b17ec95");
  amutotUrl.searchParams.set("q", query);
  amutotUrl.searchParams.set("limit", "5");

  const halatzUrl = new URL("https://data.gov.il/api/3/action/datastore_search");
  halatzUrl.searchParams.set("resource_id", "85e40960-5426-4f4c-874f-2d1ec1b94609");
  halatzUrl.searchParams.set("q", query);
  halatzUrl.searchParams.set("limit", "5");

  const [amutotResponse, halatzResponse] = await Promise.all([
    fetchJson<IsraelDatasetResponse>(amutotUrl.toString()),
    fetchJson<IsraelDatasetResponse>(halatzUrl.toString()),
  ]);

  const evidenceUrls = [amutotUrl.toString(), halatzUrl.toString()];
  if (!amutotResponse.ok) {
    notes.push(`Amutot dataset lookup failed: ${amutotResponse.errorNote}`);
  }
  if (!halatzResponse.ok) {
    notes.push(`Halatz dataset lookup failed: ${halatzResponse.errorNote}`);
  }

  const amutot = amutotResponse.ok ? amutotResponse.data.result?.records ?? [] : [];
  const halatz = halatzResponse.ok ? halatzResponse.data.result?.records ?? [] : [];

  const candidates = [
    ...amutot.map((record: Record<string, string | number | null>) => ({
      kind: "amuta" as const,
      record,
      displayName:
        String(record["שם עמותה באנגלית"] ?? "") ||
        String(record["שם עמותה בעברית"] ?? ""),
      registryId: String(record["מספר עמותה"] ?? ""),
      status: String(record["סטטוס עמותה"] ?? ""),
    })),
    ...halatz.map((record: Record<string, string | number | null>) => ({
      kind: "halatz" as const,
      record,
      displayName:
        String(record["שם חלצ באנגלית"] ?? "") ||
        String(record["שם חלצ בעברית"] ?? ""),
      registryId: String(record["מספר חלצ"] ?? ""),
      status: String(record["סטטוס חלצ"] ?? ""),
    })),
  ]
    .map((candidate) => ({
      ...candidate,
      score: Math.max(
        computeNameScore(input.name, candidate.displayName),
        computeNameScore(input.name, String(candidate.record["שם עמותה בעברית"] ?? "")),
        computeNameScore(input.name, String(candidate.record["שם חלצ בעברית"] ?? "")),
      ),
    }))
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return {
      verificationStatus: "unverified",
      confidence: 0.15,
      selectedSource: "findCharityIL",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Israel amutot and halatz open data",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        "No matching Israeli amuta or public benefit company was returned by the open datasets.",
      ],
    };
  }

  const best = candidates[0];
  const active = /פעיל|active/i.test(best.status);
  const confidence = clamp(
    0.38 +
      best.score * 0.45 +
      (active ? 0.1 : 0) +
      (input.registrationNumber &&
      sameIdentifier(input.registrationNumber, best.registryId)
        ? 0.08
        : 0),
  );

  return {
    verificationStatus:
      confidence >= 0.86
        ? "verified"
        : confidence >= 0.5
          ? "needs_review"
          : "unverified",
    confidence,
    selectedSource: "findCharityIL",
    matchedName: best.displayName || null,
    matchedCountryCode: countryCode,
    registryName:
      best.kind === "amuta"
        ? "Israel amutot open data"
        : "Israel public benefit companies open data",
    registryId: best.registryId || null,
    officialStatus: best.status || null,
    websiteMatch: "unknown",
    attemptedSources,
    evidenceUrls,
    riskFlags: [],
    notes: [
      ...notes,
      best.kind === "amuta"
        ? "Matched against the Registrar of Associations dataset."
        : "Matched against the public benefit companies dataset.",
    ],
  };
}

async function verifyWithOpenCnpj(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const registrationNumber = input.registrationNumber?.trim();

  if (!registrationNumber) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityBR",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "OpenCNPJ public API",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls: [],
      riskFlags: [],
      notes: [
        ...notes,
        "Brazil verification currently needs a CNPJ because the public API supports direct CNPJ lookups, not name search.",
      ],
    };
  }

  const lookupUrl = `https://api.opencnpj.org/${encodeURIComponent(registrationNumber)}`;
  const response = await fetchJson<OpenCnpjRecord>(lookupUrl);
  const evidenceUrls = [lookupUrl];

  if (!response.ok) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityBR",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "OpenCNPJ public API",
      registryId: registrationNumber,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        response.errorNote,
      ],
    };
  }

  const record = response.data;
  const legalName = record.razao_social ?? record.nome_fantasia ?? null;
  const officialStatus = record.descricao_situacao_cadastral ?? record.situacao_cadastral ?? null;
  const confidence = clamp(
    0.4 +
      computeNameScore(input.name, legalName ?? "") * 0.35 +
      (/ativa|active/i.test(String(officialStatus ?? "")) ? 0.1 : 0) +
      (sameIdentifier(registrationNumber, record.cnpj ?? "") ? 0.14 : 0),
  );

  return {
    verificationStatus:
      confidence >= 0.86
        ? "verified"
        : confidence >= 0.5
          ? "needs_review"
          : "unverified",
    confidence,
    selectedSource: "findCharityBR",
    matchedName: legalName,
    matchedCountryCode: countryCode,
    registryName: "OpenCNPJ public API",
    registryId: record.cnpj ?? registrationNumber,
    officialStatus,
    websiteMatch: "unknown",
    attemptedSources,
    evidenceUrls,
    riskFlags: [],
    notes: [
      ...notes,
      record.natureza_juridica ? `Natureza juridica: ${record.natureza_juridica}.` : "Natureza juridica unavailable.",
      record.municipio && record.uf
        ? `Top record location: ${record.municipio}, ${record.uf}.`
        : "Location fields were not fully available.",
    ],
  };
}

async function verifyWithHongKongSection88(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const url = "https://www.ird.gov.hk/charity/csv/s88list.csv";
  const csvResponse = await fetchText(url);
  const evidenceUrls = [url];

  if (!csvResponse.ok) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityHK",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Hong Kong IRD Section 88 CSV",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, csvResponse.errorNote],
    };
  }

  const rows = parseCsv(csvResponse.text);
  if (rows.length < 2) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.18,
      selectedSource: "findCharityHK",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Hong Kong IRD Section 88 CSV",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, "Hong Kong Section 88 CSV did not contain readable rows."],
    };
  }

  const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  const records = rows.slice(1).map((row) => toRecord(headers, row));
  const candidates = records
    .map((record) => {
      const names = [
        String(record["English name 英文名稱"] ?? ""),
        String(record["Chinese name 中文名稱"] ?? ""),
        String(record["English alias (1) 英文別名 (1)"] ?? ""),
        String(record["English alias (2) 英文別名 (2)"] ?? ""),
        String(record["Chinese alias 中文別名"] ?? ""),
        String(record["English name of subsidiary body 附屬團體英文名稱"] ?? ""),
        String(record["Chinese name of subsidiary body 附屬團體中文名稱"] ?? ""),
      ];
      const bestScore = Math.max(...names.map((name) => computeNameScore(input.name, name)));
      return {
        record,
        names,
        bestScore,
      };
    })
    .filter((candidate) => candidate.bestScore >= 0.55)
    .sort((left, right) => right.bestScore - left.bestScore);

  if (candidates.length === 0) {
    return {
      verificationStatus: "unverified",
      confidence: 0.14,
      selectedSource: "findCharityHK",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Hong Kong IRD Section 88 CSV",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        "No matching Section 88 organization name was found in the Hong Kong IRD list.",
      ],
    };
  }

  const best = candidates[0];
  const matchedName = best.names.find((name) => fold(name).length > 0) ?? null;
  const effectiveDate = String(best.record["Effective date 生效日期"] ?? "") || null;
  const positionDate = String(best.record["Position as at 截至"] ?? "") || null;

  return {
    verificationStatus: "verified",
    confidence: clamp(0.55 + best.bestScore * 0.4),
    selectedSource: "findCharityHK",
    matchedName,
    matchedCountryCode: countryCode,
    registryName: "Hong Kong IRD Section 88 CSV",
    registryId: null,
    officialStatus:
      positionDate || effectiveDate
        ? `Listed on Section 88 snapshot ${positionDate ?? ""} (effective ${effectiveDate ?? ""})`.trim()
        : "Listed on Hong Kong IRD Section 88 charity list",
    websiteMatch: "unknown",
    attemptedSources,
    evidenceUrls,
    riskFlags: [],
    notes: [
      ...notes,
      "Hong Kong adapter verifies Section 88 tax-exempt recognition, which is a strong charitable-status signal.",
    ],
  };
}

async function verifyWithTaiwanNonprofitCsv(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const url = "https://eip.fia.gov.tw/data/BGMOPEN99.csv";
  const csvResponse = await fetchText(url);
  const evidenceUrls = [url];

  if (!csvResponse.ok) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityTW",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Taiwan nonprofit public CSV",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, csvResponse.errorNote],
    };
  }

  const rows = parseCsv(csvResponse.text);
  if (rows.length < 2) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.18,
      selectedSource: "findCharityTW",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Taiwan nonprofit public CSV",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, "Taiwan nonprofit CSV did not contain readable rows."],
    };
  }

  const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  const records = rows.slice(1).map((row) => toRecord(headers, row));
  const candidates = records
    .map((record) => {
      const name = String(record["單位名稱"] ?? "");
      const registrationScore =
        input.registrationNumber &&
        sameIdentifier(input.registrationNumber, String(record["統一編號"] ?? ""))
          ? 1
          : 0;
      return {
        record,
        name,
        score: Math.max(registrationScore, computeNameScore(input.name, name)),
      };
    })
    .filter((candidate) => candidate.score >= 0.55)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return {
      verificationStatus: "unverified",
      confidence: 0.14,
      selectedSource: "findCharityTW",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Taiwan nonprofit public CSV",
      registryId: null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        "No matching Taiwan nonprofit record was found in the Ministry of Finance dataset.",
      ],
    };
  }

  const best = candidates[0];
  const updatedAt = String(best.record["最近異動日期"] ?? "") || null;

  return {
    verificationStatus: "verified",
    confidence: clamp(0.55 + best.score * 0.4),
    selectedSource: "findCharityTW",
    matchedName: best.name || null,
    matchedCountryCode: countryCode,
    registryName: "Taiwan nonprofit public CSV",
    registryId: String(best.record["統一編號"] ?? "") || null,
    officialStatus: updatedAt ? `Last updated ${updatedAt}` : "Found in Taiwan nonprofit dataset",
    websiteMatch: "unknown",
    attemptedSources,
    evidenceUrls,
    riskFlags: [],
    notes: [
      ...notes,
      best.record["機關所在縣市"]
        ? `Registered locality: ${String(best.record["機關所在縣市"]) }.`
        : "Registered locality unavailable in the matched row.",
    ],
  };
}

async function verifyWithUkraineRegistry(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const token = process.env.UKRAINE_TAX_TOKEN;

  if (!token) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityUA",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Ukraine non-profit tax registry API",
      registryId: input.registrationNumber ?? null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls: ["https://cabinet.tax.gov.ua/help/en/api-registers.html"],
      riskFlags: [],
      notes: [
        ...notes,
        "Ukraine adapter is ready but requires UKRAINE_TAX_TOKEN in the worker environment.",
      ],
    };
  }

  const url = "https://cabinet.tax.gov.ua/ws/api/public/registers/non-profit";
  const body = {
    token,
    ...(input.registrationNumber ? { tin: stripNonDigits(input.registrationNumber) } : {}),
    ...(input.name ? { name: input.name } : {}),
  };

  const response = await fetchJson<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.22,
      selectedSource: "findCharityUA",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "Ukraine non-profit tax registry API",
      registryId: input.registrationNumber ?? null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls: [url],
      riskFlags: [],
      notes: [...notes, response.errorNote],
    };
  }

  const normalized = JSON.stringify(response.data);
  const positiveMatch =
    normalized.includes(stripNonDigits(input.registrationNumber ?? "")) ||
    fold(normalized).includes(fold(input.name));

  return {
    verificationStatus: positiveMatch ? "verified" : "needs_review",
    confidence: positiveMatch ? 0.78 : 0.3,
    selectedSource: "findCharityUA",
    matchedName: positiveMatch ? input.name : null,
    matchedCountryCode: countryCode,
    registryName: "Ukraine non-profit tax registry API",
    registryId: input.registrationNumber ? stripNonDigits(input.registrationNumber) : null,
    officialStatus: positiveMatch
      ? "Matched against Ukraine nonprofit tax registry response"
      : "Registry responded but match confidence needs human review",
    websiteMatch: "unknown",
    attemptedSources,
    evidenceUrls: [url],
    riskFlags: [],
    notes: [
      ...notes,
      "Ukraine adapter currently uses the official tax registry API and should be treated as strongest when EDRPOU is provided.",
    ],
  };
}

async function verifyWithMexicoDonatarias(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  initialNotes: string[],
): Promise<VerificationResult> {
  const notes = [...initialNotes];
  const url =
    "http://omawww.sat.gob.mx/cifras_sat/Documents/reporte_donatarias_2025_datos_2024.csv";
  const csvResponse = await fetchText(url);
  const evidenceUrls = [url];

  if (!csvResponse.ok) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.2,
      selectedSource: "findCharityMX",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "SAT Donatarias open reports",
      registryId: input.registrationNumber ?? null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, csvResponse.errorNote],
    };
  }

  const rows = parseCsv(csvResponse.text);
  if (rows.length < 2) {
    return {
      verificationStatus: "needs_review",
      confidence: 0.18,
      selectedSource: "findCharityMX",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "SAT Donatarias open reports",
      registryId: input.registrationNumber ?? null,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [...notes, "Mexico donatarias CSV did not contain readable rows."],
    };
  }

  const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  const records = rows.slice(1).map((row) => toRecord(headers, row));
  const registrationNumber = input.registrationNumber?.trim() ?? null;
  const candidates = records
    .map((record) => {
      const rfc = String(record.rfc ?? "");
      const legalName = String(record.razon_social ?? "");
      const score = Math.max(
        registrationNumber ? (sameIdentifier(registrationNumber, rfc) ? 1 : 0) : 0,
        computeNameScore(input.name, legalName),
      );
      return {
        record,
        rfc,
        legalName,
        score,
      };
    })
    .filter((candidate) => candidate.score >= 0.55)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return {
      verificationStatus: "unverified",
      confidence: 0.14,
      selectedSource: "findCharityMX",
      matchedName: null,
      matchedCountryCode: countryCode,
      registryName: "SAT Donatarias open reports",
      registryId: registrationNumber,
      officialStatus: null,
      websiteMatch: "unknown",
      attemptedSources,
      evidenceUrls,
      riskFlags: [],
      notes: [
        ...notes,
        "No matching organization was found in the latest SAT open report for authorized donees.",
      ],
    };
  }

  const best = candidates[0];
  const fiscalYear = String(best.record.ejercicio_fiscal ?? "") || null;

  return {
    verificationStatus: "verified",
    confidence: clamp(0.55 + best.score * 0.4),
    selectedSource: "findCharityMX",
    matchedName: best.legalName || null,
    matchedCountryCode: countryCode,
    registryName: "SAT Donatarias open reports",
    registryId: best.rfc || null,
    officialStatus: fiscalYear
      ? `Present in SAT authorized donees report for fiscal year ${fiscalYear}`
      : "Present in SAT authorized donees report",
    websiteMatch: "unknown",
    attemptedSources,
    evidenceUrls,
    riskFlags: [],
    notes: [
      ...notes,
      best.record.tipo_donataria
        ? `Tipo de donataria: ${String(best.record.tipo_donataria)}.`
        : "Donataria type unavailable in the matched row.",
      best.record.entidad_federativa
        ? `Entidad federativa: ${String(best.record.entidad_federativa)}.`
        : "Entidad federativa unavailable in the matched row.",
    ],
  };
}

function buildAresResult(
  input: VerifyInput,
  countryCode: string,
  attemptedSources: string[],
  entity: AresEntity,
  evidenceUrls: string[],
  initialNotes: string[],
): VerificationResult {
  const notes = [...initialNotes];
  const statusSummary = summarizeAresStatus(entity.seznamRegistraci);
  const confidence = clamp(
    0.4 +
      computeNameScore(input.name, entity.obchodniJmeno ?? "") * 0.35 +
      (statusSummary.active ? 0.12 : 0) +
      (input.registrationNumber && sameIdentifier(input.registrationNumber, entity.ico ?? "")
        ? 0.12
        : 0),
  );

  notes.push(
    "Czech adapter verifies legal-entity existence through ARES; nonprofit status may still need supporting context for some entity types.",
  );

  return {
    verificationStatus:
      confidence >= 0.86
        ? "verified"
        : confidence >= 0.5
          ? "needs_review"
          : "unverified",
    confidence,
    selectedSource: "findCharityCZ",
    matchedName: entity.obchodniJmeno ?? null,
    matchedCountryCode: countryCode,
    registryName: "ARES economic entities API",
    registryId: entity.ico ?? entity.icoId ?? null,
    officialStatus: statusSummary.text,
    websiteMatch: "unknown",
    attemptedSources,
    evidenceUrls,
    riskFlags: [],
    notes,
  };
}

function summarizeAresStatus(
  registrations: AresEntity["seznamRegistraci"] | undefined,
): { active: boolean; text: string | null } {
  if (!registrations) {
    return { active: false, text: null };
  }

  const entries = Object.entries(registrations)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${key}=${value}`);
  const active = entries.some((entry) => /AKTIVNI/i.test(entry));
  return {
    active,
    text: entries.slice(0, 6).join(", ") || null,
  };
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; errorNote: string }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json, text/csv;q=0.9, */*;q=0.8",
        "User-Agent": "Mozilla/5.0",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      return { ok: false, errorNote: `Request failed with HTTP ${response.status}.` };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      errorNote: error instanceof Error ? error.message : "Unknown fetch error.",
    };
  }
}

function normalizeCountryCode(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    USA: "US",
    UNITEDSTATES: "US",
    UNITEDKINGDOM: "GB",
    UK: "GB",
    GBR: "GB",
    CAN: "CA",
    AUS: "AU",
    NZL: "NZ",
    IND: "IN",
    IRL: "IE",
    CZECHREPUBLIC: "CZ",
    CZECHIA: "CZ",
    BRAZIL: "BR",
    ISRAEL: "IL",
    TAIWAN: "TW",
    HONGKONG: "HK",
    SINGAPORE: "SG",
    MALAYSIA: "MY",
    UKRAINE: "UA",
    MEXICO: "MX",
    HUNGARY: "HU",
    SWITZERLAND: "CH",
    INDONESIA: "ID",
    PAKISTAN: "PK",
    BERMUDA: "BM",
    BELARUS: "BY",
    ECUADOR: "EC",
    SLOVAKIA: "SK",
    BOSNIAANDHERZEGOVINA: "BA",
    ARGENTINA: "AR",
    COSTARICA: "CR",
  };

  return aliases[normalized.replace(/[^A-Z]/g, "")] ?? normalized;
}

function sanitizeRegistrationNumber(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const stripped = stripNonDigits(value);
  return stripped.length > 0 ? stripped : value.trim();
}

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function sameIdentifier(left: string | null, right: string | null): boolean {
  if (!left || !right) {
    return false;
  }

  const leftDigits = stripNonDigits(left);
  const rightDigits = stripNonDigits(right);

  if (leftDigits && rightDigits) {
    return leftDigits === rightDigits;
  }

  return fold(left) === fold(right);
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function computeNameScore(expected: string, actual: string): number {
  const expectedFolded = fold(expected);
  const actualFolded = fold(actual);

  if (!expectedFolded || !actualFolded) {
    return 0;
  }
  if (expectedFolded === actualFolded) {
    return 1;
  }
  if (
    expectedFolded.includes(actualFolded) ||
    actualFolded.includes(expectedFolded)
  ) {
    return 0.9;
  }

  const expectedTokens = new Set(expectedFolded.split(" "));
  const actualTokens = new Set(actualFolded.split(" "));
  const intersection = [...expectedTokens].filter((token) =>
    actualTokens.has(token),
  ).length;
  const union = new Set([...expectedTokens, ...actualTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

function extractHostname(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    const emailMatch = value.match(/@([^@]+)$/);
    return emailMatch ? emailMatch[1].toLowerCase() : null;
  }
}

function compareDomains(
  claimedDomain: string | null,
  registryDomain: string | null,
): WebsiteMatch {
  if (!claimedDomain || !registryDomain) {
    return "unknown";
  }
  if (claimedDomain === registryDomain) {
    return "exact";
  }
  if (
    claimedDomain.endsWith(`.${registryDomain}`) ||
    registryDomain.endsWith(`.${claimedDomain}`)
  ) {
    return "partial";
  }
  return "mismatch";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    record[header] = row[index] ?? "";
  });
  return record;
}

async function fetchText(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; text: string } | { ok: false; errorNote: string }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "text/csv, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "Mozilla/5.0",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      return { ok: false, errorNote: `Request failed with HTTP ${response.status}.` };
    }

    return { ok: true, text: await response.text() };
  } catch (error) {
    return {
      ok: false,
      errorNote: error instanceof Error ? error.message : "Unknown fetch error.",
    };
  }
}

type AresSearchResponse = {
  ekonomickeSubjekty?: AresEntity[];
  pocetCelkem?: number;
};

type AresEntity = {
  ico?: string;
  icoId?: string;
  obchodniJmeno?: string;
  datumVzniku?: string;
  pravniForma?: string;
  pravniFormaRos?: string;
  dic?: string;
  sidlo?: {
    textovaAdresa?: string;
    nazevObce?: string;
  };
  seznamRegistraci?: Record<string, string | undefined>;
};

type IsraelDatasetResponse = {
  result?: {
    records?: Array<Record<string, string | number | null>>;
  };
};

type OpenCnpjRecord = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  situacao_cadastral?: string;
  natureza_juridica?: string;
  municipio?: string;
  uf?: string;
};
