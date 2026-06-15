import type { AdapterHandler } from "../core/adapters.js";
import { fetchText } from "../core/http.js";
import { clamp, computeNameScore, parseCsv, sameIdentifier, toRecord } from "../core/utils.js";

export const verifyWithMexicoDonatarias: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
}) => {
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
};
