import type { AdapterHandler } from "../core/adapters.js";
import { fetchText } from "../core/http.js";
import {
	clamp,
	computeNameScore,
	parseCsv,
	sameIdentifier,
	toRecord,
} from "../core/utils.js";

export const verifyWithTaiwanNonprofitCsv: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
}) => {
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
		officialStatus: updatedAt
			? `Last updated ${updatedAt}`
			: "Found in Taiwan nonprofit dataset",
		websiteMatch: "unknown",
		attemptedSources,
		evidenceUrls,
		riskFlags: [],
		notes: [
			...notes,
			best.record["機關所在縣市"]
				? `Registered locality: ${String(best.record["機關所在縣市"])}.`
				: "Registered locality unavailable in the matched row.",
		],
	};
};
