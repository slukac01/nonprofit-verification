import assert from "node:assert/strict";
import test from "node:test";

import { verifyWithCharityBase } from "../../src/adapters/uk.js";
import { makeAdapterContext } from "../helpers/adapterContext.js";
import { installMockFetch, jsonResponse } from "../helpers/mockFetch.js";

test("UK adapter returns verified for a strong active CharityBase match", async () => {
	const restoreFetch = installMockFetch(async () =>
		jsonResponse({
			data: {
				CHC: {
					getCharities: {
						list: [
							{
								id: "123456",
								names: [{ value: "Acme Foundation", primary: true }],
								contact: { email: "info@acme.org", phone: "123" },
								registrations: [{ registrationDate: "2012-01-01", removalDate: null }],
							},
						],
					},
				},
			},
		}),
	);

	const originalApiKey = process.env.CHARITYBASE_API_KEY;
	process.env.CHARITYBASE_API_KEY = "test-key";

	try {
		const result = await verifyWithCharityBase(
			makeAdapterContext({
				countryCode: "GB",
				attemptedSources: ["findCharityUK"],
				input: {
					name: "Acme Foundation",
					website: "https://acme.org",
					registrationNumber: "123456",
				},
			}),
		);

		assert.equal(result.verificationStatus, "verified");
		assert.equal(result.selectedSource, "findCharityUK");
		assert.equal(result.registryId, "123456");
		assert.equal(result.websiteMatch, "exact");
		assert.ok(result.confidence >= 0.86);
	} finally {
		restoreFetch();
		if (originalApiKey === undefined) {
			delete process.env.CHARITYBASE_API_KEY;
		} else {
			process.env.CHARITYBASE_API_KEY = originalApiKey;
		}
	}
});

test("UK adapter returns needs_review when the charity has been removed", async () => {
	const restoreFetch = installMockFetch(async () =>
		jsonResponse({
			data: {
				CHC: {
					getCharities: {
						list: [
							{
								id: "654321",
								names: [{ value: "Acme Foundation", primary: true }],
								contact: { email: "contact@acme.org", phone: "123" },
								registrations: [{ registrationDate: "2012-01-01", removalDate: "2024-06-01" }],
							},
						],
					},
				},
			},
		}),
	);

	const originalApiKey = process.env.CHARITYBASE_API_KEY;
	process.env.CHARITYBASE_API_KEY = "test-key";

	try {
		const result = await verifyWithCharityBase(
			makeAdapterContext({
				countryCode: "GB",
				attemptedSources: ["findCharityUK"],
				input: {
					name: "Acme Foundation",
					website: "https://acme.org",
				},
			}),
		);

		assert.equal(result.verificationStatus, "needs_review");
		assert.match(result.officialStatus ?? "", /Removed from register/i);
		assert.equal(result.selectedSource, "findCharityUK");
	} finally {
		restoreFetch();
		if (originalApiKey === undefined) {
			delete process.env.CHARITYBASE_API_KEY;
		} else {
			process.env.CHARITYBASE_API_KEY = originalApiKey;
		}
	}
});
