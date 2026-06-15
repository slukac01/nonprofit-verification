import type { VerificationStatus, WebsiteMatch } from "./types.js";

export function normalizeCountryCode(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const normalized = value.trim().toUpperCase();
	const aliases: Record<string, string> = {
		USA: "US",
		UNITEDSTATES: "US",
		UNITEDKINGDOM: "GB",
		UK: "GB",
		GBR: "GB",
		CAN: "CA",
		AUS: "AU",
		NZL: "NZ",
		IND: "IN",
		IRL: "IE",
		CZECHREPUBLIC: "CZ",
		CZECHIA: "CZ",
		BRAZIL: "BR",
		ISRAEL: "IL",
		TAIWAN: "TW",
		HONGKONG: "HK",
		SINGAPORE: "SG",
		MALAYSIA: "MY",
		UKRAINE: "UA",
		MEXICO: "MX",
		HUNGARY: "HU",
		SWITZERLAND: "CH",
		INDONESIA: "ID",
		PAKISTAN: "PK",
		BERMUDA: "BM",
		BELARUS: "BY",
		ECUADOR: "EC",
		SLOVAKIA: "SK",
		BOSNIAANDHERZEGOVINA: "BA",
		ARGENTINA: "AR",
		COSTARICA: "CR",
	};

	return aliases[normalized.replace(/[^A-Z]/g, "")] ?? normalized;
}

export function sanitizeRegistrationNumber(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const stripped = stripNonDigits(value);
	return stripped.length > 0 ? stripped : value.trim();
}

export function stripNonDigits(value: string): string {
	return value.replace(/\D/g, "");
}

export function sameIdentifier(left: string | null, right: string | null): boolean {
	if (!left || !right) {
		return false;
	}

	const leftDigits = stripNonDigits(left);
	const rightDigits = stripNonDigits(right);

	if (leftDigits && rightDigits) {
		return leftDigits === rightDigits;
	}

	return fold(left) === fold(right);
}

export function fold(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

export function computeNameScore(expected: string, actual: string): number {
	const expectedFolded = fold(expected);
	const actualFolded = fold(actual);

	if (!expectedFolded || !actualFolded) {
		return 0;
	}
	if (expectedFolded === actualFolded) {
		return 1;
	}
	if (
		expectedFolded.includes(actualFolded) ||
		actualFolded.includes(expectedFolded)
	) {
		return 0.9;
	}

	const expectedTokens = new Set(expectedFolded.split(" "));
	const actualTokens = new Set(actualFolded.split(" "));
	const intersection = [...expectedTokens].filter((token) =>
		actualTokens.has(token),
	).length;
	const union = new Set([...expectedTokens, ...actualTokens]).size;

	return union === 0 ? 0 : intersection / union;
}

export function extractHostname(value: string | null): string | null {
	if (!value) {
		return null;
	}

	try {
		const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
		const url = new URL(withProtocol);
		return url.hostname.replace(/^www\./i, "").toLowerCase();
	} catch {
		const emailMatch = value.match(/@([^@]+)$/);
		return emailMatch ? emailMatch[1].toLowerCase() : null;
	}
}

export function compareDomains(
	claimedDomain: string | null,
	registryDomain: string | null,
): WebsiteMatch {
	if (!claimedDomain || !registryDomain) {
		return "unknown";
	}
	if (claimedDomain === registryDomain) {
		return "exact";
	}
	if (
		claimedDomain.endsWith(`.${registryDomain}`) ||
		registryDomain.endsWith(`.${claimedDomain}`)
	) {
		return "partial";
	}
	return "mismatch";
}

export function clamp(value: number): number {
	return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		const next = text[i + 1];

		if (char === "\"") {
			if (inQuotes && next === "\"") {
				field += "\"";
				i += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (!inQuotes && char === ",") {
			row.push(field);
			field = "";
			continue;
		}

		if (!inQuotes && (char === "\n" || char === "\r")) {
			if (char === "\r" && next === "\n") {
				i += 1;
			}
			row.push(field);
			if (row.some((value) => value.length > 0)) {
				rows.push(row);
			}
			row = [];
			field = "";
			continue;
		}

		field += char;
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	return rows;
}

export function toRecord(headers: string[], row: string[]): Record<string, string> {
	const record: Record<string, string> = {};
	headers.forEach((header, index) => {
		record[header] = row[index] ?? "";
	});
	return record;
}

export function statusFromConfidence(confidence: number): VerificationStatus {
	if (confidence >= 0.86) {
		return "verified";
	}
	if (confidence >= 0.5) {
		return "needs_review";
	}
	return "unverified";
}
