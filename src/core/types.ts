import { j } from "@notionhq/workers/schema-builder";

export type VerificationStatus =
	| "verified"
	| "needs_review"
	| "unverified"
	| "unsupported_country";

export type WebsiteMatch = "exact" | "partial" | "mismatch" | "unknown";

export type SourceDefinition = {
	key: string;
	label: string;
	countries: string[];
	coverageNote: string;
	live: boolean;
	requiresEnv: string | null;
};

export type VerificationResult = {
	verificationStatus: VerificationStatus;
	confidence: number;
	selectedSource: string;
	matchedName: string | null;
	matchedCountryCode: string | null;
	registryName: string | null;
	registryId: string | null;
	officialStatus: string | null;
	websiteMatch: WebsiteMatch;
	attemptedSources: string[];
	evidenceUrls: string[];
	riskFlags: string[];
	notes: string[];
};

export type VerifyInput = {
	name: string;
	countryCode: string | null;
	website: string | null;
	registrationNumber: string | null;
};

export const sourceSummarySchema = j.object({
	key: j.string(),
	label: j.string(),
	coverageNote: j.string(),
	live: j.boolean(),
	requiresEnv: j.string().nullable(),
});

export const verificationOutputSchema = j.object({
	verificationStatus: j.enum(
		"verified",
		"needs_review",
		"unverified",
		"unsupported_country",
	),
	confidence: j.number(),
	selectedSource: j.string(),
	matchedName: j.string().nullable(),
	matchedCountryCode: j.string().nullable(),
	registryName: j.string().nullable(),
	registryId: j.string().nullable(),
	officialStatus: j.string().nullable(),
	websiteMatch: j.enum("exact", "partial", "mismatch", "unknown"),
	attemptedSources: j.array(j.string()),
	evidenceUrls: j.array(j.string()),
	riskFlags: j.array(j.string()),
	notes: j.array(j.string()),
});

export function toSourceSummary(source: SourceDefinition) {
	return {
		key: source.key,
		label: source.label,
		coverageNote: source.coverageNote,
		live: source.live,
		requiresEnv: source.requiresEnv,
	};
}
