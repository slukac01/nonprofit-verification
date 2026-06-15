import type { SourceAdapterDefinition } from "./core/adapters.js";
import { verifyWithOpenCnpj } from "./adapters/br.js";
import { verifyWithAres } from "./adapters/cz.js";
import { verifyWithHongKongSection88 } from "./adapters/hk.js";
import { verifyWithIsraelRegistry } from "./adapters/il.js";
import { verifyWithMexicoDonatarias } from "./adapters/mx.js";
import { verifyWithTaiwanNonprofitCsv } from "./adapters/tw.js";
import { verifyWithUkraineRegistry } from "./adapters/ua.js";
import { verifyWithCharityBase } from "./adapters/uk.js";
import { verifyWithProPublica } from "./adapters/us.js";

export const SOURCE_DEFINITIONS: SourceAdapterDefinition[] = [
	{
		key: "findCharityUS",
		label: "ProPublica Nonprofit Explorer v2",
		countries: ["US"],
		coverageNote: "IRS-exempt organizations in the United States.",
		live: true,
		requiresEnv: null,
		verify: verifyWithProPublica,
	},
	{
		key: "findCharityUK",
		label: "CharityBase GraphQL",
		countries: ["GB", "UK"],
		coverageNote:
			"Best for England and Wales via Charity Commission-backed data in CharityBase.",
		live: true,
		requiresEnv: "CHARITYBASE_API_KEY",
		verify: verifyWithCharityBase,
	},
	{
		key: "findCharityCA",
		label: "CRA Charity Listings",
		countries: ["CA"],
		coverageNote:
			"Planned: best implemented as periodic CSV ingest or a dedicated adapter.",
		live: false,
		requiresEnv: null,
	},
	{
		key: "findCharityAU",
		label: "ABN Lookup + ACNC",
		countries: ["AU"],
		coverageNote:
			"Planned: combine legal-entity identity from ABN with charity status from ACNC.",
		live: false,
		requiresEnv: null,
	},
	{
		key: "findCharityNZ",
		label: "Charities Services OData",
		countries: ["NZ"],
		coverageNote: "Planned: direct registry lookup for New Zealand charities.",
		live: false,
		requiresEnv: null,
	},
	{
		key: "findCharityIE",
		label: "Ireland Charities Regulator",
		countries: ["IE"],
		coverageNote: "Recommended next source for Ireland coverage.",
		live: false,
		requiresEnv: null,
	},
	{
		key: "findCharityIN",
		label: "NGO Darpan + FCRA",
		countries: ["IN"],
		coverageNote:
			"Recommended next source for India, especially for foreign-funding checks.",
		live: false,
		requiresEnv: null,
	},
	{
		key: "findCharityCZ",
		label: "ARES economic entities API",
		countries: ["CZ"],
		coverageNote:
			"Czech public registry API for legal-entity existence and status via ARES.",
		live: true,
		requiresEnv: null,
		verify: verifyWithAres,
	},
	{
		key: "findCharityIL",
		label: "Israel amutot and halatz open data",
		countries: ["IL"],
		coverageNote:
			"Ministry of Justice open datasets for associations and public benefit companies.",
		live: true,
		requiresEnv: null,
		verify: verifyWithIsraelRegistry,
	},
	{
		key: "findCharityBR",
		label: "OpenCNPJ public API",
		countries: ["BR"],
		coverageNote:
			"Public CNPJ data useful for Brazilian nonprofit legal-entity verification.",
		live: true,
		requiresEnv: null,
		verify: verifyWithOpenCnpj,
	},
	{
		key: "findCharityHK",
		label: "Hong Kong IRD Section 88 CSV",
		countries: ["HK"],
		coverageNote:
			"Official Inland Revenue Department Section 88 charity list in CSV format.",
		live: true,
		requiresEnv: null,
		verify: verifyWithHongKongSection88,
	},
	{
		key: "findCharityTW",
		label: "Taiwan nonprofit public CSV",
		countries: ["TW"],
		coverageNote:
			"Ministry of Finance nonprofit dataset for registered nonprofit entities.",
		live: true,
		requiresEnv: null,
		verify: verifyWithTaiwanNonprofitCsv,
	},
	{
		key: "findCharityUA",
		label: "Ukraine non-profit tax registry API",
		countries: ["UA"],
		coverageNote:
			"Official Ukrainian nonprofit registry API; requires a user-generated tax cabinet token.",
		live: true,
		requiresEnv: "UKRAINE_TAX_TOKEN",
		verify: verifyWithUkraineRegistry,
	},
	{
		key: "findCharityMX",
		label: "SAT Donatarias open reports",
		countries: ["MX"],
		coverageNote:
			"SAT publishes machine-readable reports for authorized donees; this adapter uses the latest available open CSV report.",
		live: true,
		requiresEnv: null,
		verify: verifyWithMexicoDonatarias,
	},
];
