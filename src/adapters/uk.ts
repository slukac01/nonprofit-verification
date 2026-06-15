import type { AdapterHandler } from "../core/adapters.js";
import { clamp, compareDomains, computeNameScore, extractHostname, sameIdentifier, statusFromConfidence } from "../core/utils.js";

export const verifyWithCharityBase: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
	claimedDomain,
}) => {
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
		verificationStatus: statusFromConfidence(confidence),
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
};
