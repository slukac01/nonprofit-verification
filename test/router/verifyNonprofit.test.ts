import assert from "node:assert/strict";
import test from "node:test";

import { verifyNonprofit } from "../../src/router.js";
import { installMockFetch, jsonResponse } from "../helpers/mockFetch.js";

test("router returns needs_review when country code is missing", async () => {
	const result = await verifyNonprofit({
		name: "Acme Foundation",
		countryCode: null,
		website: null,
		registrationNumber: null,
	});

	assert.equal(result.verificationStatus, "needs_review");
	assert.equal(result.selectedSource, "routing");
	assert.deepEqual(result.attemptedSources, []);
	assert.match(result.notes[0] ?? "", /Country code is required/i);
});

test("router returns unsupported_country when no adapter is registered", async () => {
	const result = await verifyNonprofit({
		name: "Acme Foundation",
		countryCode: "FR",
		website: null,
		registrationNumber: null,
	});

	assert.equal(result.verificationStatus, "unsupported_country");
	assert.equal(result.matchedCountryCode, "FR");
	assert.match(result.notes[0] ?? "", /No source adapter is registered yet for FR/i);
});

test("router reports missing env var for gated adapters", async () => {
	const originalApiKey = process.env.CHARITYBASE_API_KEY;
	delete process.env.CHARITYBASE_API_KEY;

	try {
		const result = await verifyNonprofit({
			name: "Acme Foundation",
			countryCode: "GB",
			website: null,
			registrationNumber: null,
		});

		assert.equal(result.verificationStatus, "needs_review");
		assert.deepEqual(result.attemptedSources, ["findCharityUK"]);
		assert.equal(result.selectedSource, "findCharityUK");
		assert.match(result.notes.join(" "), /CHARITYBASE_API_KEY/);
	} finally {
		if (originalApiKey === undefined) {
			delete process.env.CHARITYBASE_API_KEY;
		} else {
			process.env.CHARITYBASE_API_KEY = originalApiKey;
		}
	}
});

test("router dispatches to the US adapter", async () => {
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
		const result = await verifyNonprofit({
			name: "Acme Foundation",
			countryCode: "US",
			website: null,
			registrationNumber: "12-3456789",
		});

		assert.equal(result.selectedSource, "findCharityUS");
		assert.equal(result.verificationStatus, "verified");
		assert.deepEqual(result.attemptedSources, ["findCharityUS"]);
		assert.equal(result.registryId, "123456789");
	} finally {
		restoreFetch();
	}
});
