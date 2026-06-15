import type { AdapterHandler } from "../core/adapters.js";
import { clamp, computeNameScore, sameIdentifier, sanitizeRegistrationNumber, statusFromConfidence, stripNonDigits } from "../core/utils.js";

export const verifyWithProPublica: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
}) => {
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
		verificationStatus: statusFromConfidence(confidence),
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
};
