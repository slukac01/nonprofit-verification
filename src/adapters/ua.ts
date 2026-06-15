import type { AdapterHandler } from "../core/adapters.js";
import { fetchJson } from "../core/http.js";
import { fold, stripNonDigits } from "../core/utils.js";

export const verifyWithUkraineRegistry: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
}) => {
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
	const confidence = positiveMatch ? 0.78 : 0.3;

	return {
		verificationStatus: positiveMatch
			? "verified"
			: "needs_review",
		confidence,
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
};
