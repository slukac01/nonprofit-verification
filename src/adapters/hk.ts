import type { AdapterHandler } from "../core/adapters.js";
import { fetchText } from "../core/http.js";
import { clamp, computeNameScore, fold, parseCsv, toRecord } from "../core/utils.js";

export const verifyWithHongKongSection88: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
}) => {
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
};
