import { SOURCE_DEFINITIONS } from "./sources.js";
import { extractHostname, normalizeCountryCode } from "./core/utils.js";
import { toSourceSummary, type VerificationResult, type VerifyInput } from "./core/types.js";

export async function verifyNonprofit(input: VerifyInput): Promise<VerificationResult> {
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

		if (!source.verify) {
			notes.push(`No adapter implementation is currently wired for ${source.key}.`);
			continue;
		}

		return source.verify({
			input,
			countryCode: normalizedCountry,
			attemptedSources,
			notes,
			claimedDomain,
		});
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

export function listVerificationCoverage(countryCode: string | null) {
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
}
