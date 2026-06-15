import type { AdapterContext } from "../../src/core/adapters.js";
import type { VerifyInput } from "../../src/core/types.js";
import { extractHostname } from "../../src/core/utils.js";

type AdapterContextOverrides = {
	input?: Partial<VerifyInput>;
	countryCode?: string;
	attemptedSources?: string[];
	notes?: string[];
	claimedDomain?: string | null;
};

export function makeAdapterContext(
	overrides: AdapterContextOverrides = {},
): AdapterContext {
	const input: VerifyInput = {
		name: "Acme Foundation",
		countryCode: overrides.countryCode ?? "US",
		website: null,
		registrationNumber: null,
		...overrides.input,
	};

	return {
		input,
		countryCode: overrides.countryCode ?? input.countryCode ?? "US",
		attemptedSources: overrides.attemptedSources ?? ["testSource"],
		notes: overrides.notes ?? [],
		claimedDomain:
			overrides.claimedDomain === undefined
				? extractHostname(input.website)
				: overrides.claimedDomain,
	};
}
