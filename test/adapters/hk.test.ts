import assert from "node:assert/strict";
import test from "node:test";

import { verifyWithHongKongSection88 } from "../../src/adapters/hk.js";
import { makeAdapterContext } from "../helpers/adapterContext.js";
import { installMockFetch, textResponse } from "../helpers/mockFetch.js";

test("HK adapter returns verified for a matching Section 88 entry", async () => {
	const restoreFetch = installMockFetch(async () =>
		textResponse(`English name 英文名稱,Chinese name 中文名稱,Effective date 生效日期,Position as at 截至
Acme Foundation,,2024-01-01,2024-12-31
`),
	);

	try {
		const result = await verifyWithHongKongSection88(
			makeAdapterContext({
				countryCode: "HK",
				attemptedSources: ["findCharityHK"],
				input: {
					name: "Acme Foundation",
				},
			}),
		);

		assert.equal(result.verificationStatus, "verified");
		assert.equal(result.selectedSource, "findCharityHK");
		assert.match(result.officialStatus ?? "", /Section 88/i);
	} finally {
		restoreFetch();
	}
});

test("HK adapter returns needs_review for unreadable CSV content", async () => {
	const restoreFetch = installMockFetch(async () => textResponse("English name 英文名稱\n"));

	try {
		const result = await verifyWithHongKongSection88(
			makeAdapterContext({
				countryCode: "HK",
				attemptedSources: ["findCharityHK"],
				input: {
					name: "Acme Foundation",
				},
			}),
		);

		assert.equal(result.verificationStatus, "needs_review");
		assert.match(result.notes.join(" "), /did not contain readable rows/i);
	} finally {
		restoreFetch();
	}
});
