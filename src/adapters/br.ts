import type { AdapterHandler } from "../core/adapters.js";
import { fetchJson } from "../core/http.js";
import { clamp, computeNameScore, sameIdentifier, statusFromConfidence } from "../core/utils.js";

export const verifyWithOpenCnpj: AdapterHandler = async ({
	input,
	countryCode,
	attemptedSources,
	notes: initialNotes,
}) => {
	const notes = [...initialNotes];
	const registrationNumber = input.registrationNumber?.trim();

	if (!registrationNumber) {
		return {
			verificationStatus: "needs_review",
			confidence: 0.2,
			selectedSource: "findCharityBR",
			matchedName: null,
			matchedCountryCode: countryCode,
			registryName: "OpenCNPJ public API",
			registryId: null,
			officialStatus: null,
			websiteMatch: "unknown",
			attemptedSources,
			evidenceUrls: [],
			riskFlags: [],
			notes: [
				...notes,
				"Brazil verification currently needs a CNPJ because the public API supports direct CNPJ lookups, not name search.",
			],
		};
	}

	const lookupUrl = `https://api.opencnpj.org/${encodeURIComponent(registrationNumber)}`;
	const response = await fetchJson<OpenCnpjRecord>(lookupUrl);
	const evidenceUrls = [lookupUrl];

	if (!response.ok) {
		return {
			verificationStatus: "needs_review",
			confidence: 0.2,
			selectedSource: "findCharityBR",
			matchedName: null,
			matchedCountryCode: countryCode,
			registryName: "OpenCNPJ public API",
			registryId: registrationNumber,
			officialStatus: null,
			websiteMatch: "unknown",
			attemptedSources,
			evidenceUrls,
			riskFlags: [],
			notes: [...notes, response.errorNote],
		};
	}

	const record = response.data;
	const legalName = record.razao_social ?? record.nome_fantasia ?? null;
	const officialStatus =
		record.descricao_situacao_cadastral ?? record.situacao_cadastral ?? null;
	const confidence = clamp(
		0.4 +
			computeNameScore(input.name, legalName ?? "") * 0.35 +
			(/ativa|active/i.test(String(officialStatus ?? "")) ? 0.1 : 0) +
			(sameIdentifier(registrationNumber, record.cnpj ?? "") ? 0.14 : 0),
	);

	return {
		verificationStatus: statusFromConfidence(confidence),
		confidence,
		selectedSource: "findCharityBR",
		matchedName: legalName,
		matchedCountryCode: countryCode,
		registryName: "OpenCNPJ public API",
		registryId: record.cnpj ?? registrationNumber,
		officialStatus,
		websiteMatch: "unknown",
		attemptedSources,
		evidenceUrls,
		riskFlags: [],
		notes: [
			...notes,
			record.natureza_juridica
				? `Natureza juridica: ${record.natureza_juridica}.`
				: "Natureza juridica unavailable.",
			record.municipio && record.uf
				? `Top record location: ${record.municipio}, ${record.uf}.`
				: "Location fields were not fully available.",
		],
	};
};

type OpenCnpjRecord = {
	cnpj?: string;
	razao_social?: string;
	nome_fantasia?: string;
	descricao_situacao_cadastral?: string;
	situacao_cadastral?: string;
	natureza_juridica?: string;
	municipio?: string;
	uf?: string;
};
