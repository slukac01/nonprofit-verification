import assert from "node:assert/strict";
import test from "node:test";

import { verifyWithProPublica } from "../../src/adapters/us.js";
import { makeAdapterContext } from "../helpers/adapterContext.js";
import { installMockFetch, jsonResponse } from "../helpers/mockFetch.js";

test("US adapter returns verified for a strong exact match", async () => {
	const restoreFetch = installMockFetch(async () =>
		jsonResponse({
			organizations: [
				{
					strein: "123456789",
					name: "Acme Foundation",
					city: "Austin",
					state: "TX",
					have_filings: true,
					ntee_code: "T20",
				},
			],
		}),
	);

	try {
		const result = await verifyWithProPublica(
			makeAdapterContext({
				countryCode: "US",
				attemptedSources: ["findCharityUS"],
				input: {
					name: "Acme Foundation",
					registrationNumber: "12-3456789",
				},
			}),
		);

		assert.equal(result.verificationStatus, "verified");
		assert.equal(result.selectedSource, "findCharityUS");
		assert.equal(result.registryId, "123456789");
		assert.ok(result.confidence >= 0.86);
	} finally {
		restoreFetch();
	}
});

test("US adapter returns unverified when the search is empty", async () => {
	const restoreFetch = installMockFetch(async () =>
		jsonResponse({
			organizations: [],
		}),
	);

	try {
		const result = await verifyWithProPublica(
			makeAdapterContext({
				countryCode: "US",
				attemptedSources: ["findCharityUS"],
				input: {
					name: "Unknown Foundation",
				},
			}),
		);

		assert.equal(result.verificationStatus, "unverified");
		assert.equal(result.selectedSource, "findCharityUS");
		assert.match(result.notes.join(" "), /No U\.S\. nonprofit match/i);
	} finally {
		restoreFetch();
	}
});
