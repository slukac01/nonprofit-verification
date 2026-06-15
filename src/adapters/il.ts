import type { AdapterHandler } from "../core/adapters.js";
import { fetchJson } from "../core/http.js";
import { clamp, computeNameScore, sameIdentifier, statusFromConfidence } from "../core/utils.js";

export const verifyWithIsraelRegistry: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
}) => {
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
			(input.registrationNumber && sameIdentifier(input.registrationNumber, best.registryId)
				? 0.08
				: 0),
	);

	return {
		verificationStatus: statusFromConfidence(confidence),
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
};

type IsraelDatasetResponse = {
	result?: {
		records?: Array<Record<string, string | number | null>>;
	};
};
