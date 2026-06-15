import type { AdapterHandler } from "../core/adapters.js";
import type { VerificationResult } from "../core/types.js";
import { fetchJson } from "../core/http.js";
import { clamp, computeNameScore, sameIdentifier, sanitizeRegistrationNumber, statusFromConfidence } from "../core/utils.js";

export const verifyWithAres: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
}) => {
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
				notes: [...notes, response.errorNote],
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
				notes: [...notes, "ARES detail lookup did not return a usable record."],
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
			notes: [...notes, searchResponse.errorNote],
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
};

function buildAresResult(
	input: { name: string; registrationNumber: string | null },
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
		verificationStatus: statusFromConfidence(confidence),
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
