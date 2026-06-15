import type { SourceDefinition, VerificationResult, VerifyInput } from "./types.js";

export type AdapterContext = {
	input: VerifyInput;
	countryCode: string;
	attemptedSources: string[];
	notes: string[];
	claimedDomain: string | null;
};

export type AdapterHandler = (context: AdapterContext) => Promise<VerificationResult>;

export type SourceAdapterDefinition = SourceDefinition & {
	verify?: AdapterHandler;
};
