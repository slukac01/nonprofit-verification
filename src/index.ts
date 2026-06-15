import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";

import { listVerificationCoverage, verifyNonprofit } from "./router.js";
import { sourceSummarySchema, type VerificationResult, type VerifyInput, verificationOutputSchema } from "./core/types.js";

const worker = new Worker();
export default worker;

worker.tool<VerifyInput, VerificationResult>("verifyNonprofit", {
	title: "Verify Nonprofit",
	description:
		"Verify a nonprofit against country-specific registry sources and return a normalized result.",
	schema: j.object({
		name: j.string().describe("Organization name to verify."),
		countryCode: j
			.string()
			.nullable()
			.describe("Two-letter country code when known, such as US, GB, CA, AU, or NZ."),
		website: j
			.string()
			.nullable()
			.describe("Claimed organization website, if available."),
		registrationNumber: j
			.string()
			.nullable()
			.describe("Known charity number, EIN, or registry identifier if available."),
	}),
	outputSchema: verificationOutputSchema,
	hints: {
		readOnlyHint: true,
	},
	execute: async (input) => verifyNonprofit(input),
});

worker.tool("listVerificationCoverage", {
	title: "List Verification Coverage",
	description:
		"Show which countries and source adapters are live, planned, or require credentials.",
	schema: j.object({
		countryCode: j
			.string()
			.nullable()
			.describe("Optional country code to filter the source list."),
	}),
	outputSchema: j.object({
		countryCode: j.string().nullable(),
		sources: j.array(sourceSummarySchema),
		notes: j.array(j.string()),
	}),
	hints: {
		readOnlyHint: true,
	},
	execute: async ({ countryCode }) => listVerificationCoverage(countryCode),
});
