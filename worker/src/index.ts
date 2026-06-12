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
			"Planned: combine legal-entity identity from ABN with charity/financial status from ACNC.",
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
						"Live adapters currently include US and UK.",
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
			websiteMatch: claimedDomain ? "unknown" : "unknown",
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
			notes: [
				...notes,
				`ProPublica lookup failed with HTTP ${response.status}.`,
			],
		};
	}

	const payload = (await response.json()) as {
		organizations?: Array<{
			ein?: number;
			strein?: string;
			name?: string;
			city?: string;
			state?: string;
			score?: number;
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
			notes: [
				...notes,
				`CharityBase lookup failed with HTTP ${response.status}.`,
			],
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
