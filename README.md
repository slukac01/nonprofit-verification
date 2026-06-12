# Nonprofit Verification Workers

This project is a TypeScript-based Notion worker that verifies nonprofits against country-specific public registries and normalizes the result into a consistent response shape.

The worker exposes two tools:

- `verifyNonprofit`: looks up an organization by name, country, website, and/or registration number, then returns a verification status, confidence score, registry details, evidence URLs, and review notes.
- `listVerificationCoverage`: shows which country adapters are live, planned, or require credentials.

## What It Does

The worker is designed to help answer questions like:

- Is this organization present in an official or trusted registry?
- Does the registration number match the record returned?
- Does the claimed website appear to align with registry contact data when available?
- Should this result be treated as verified, unverified, unsupported, or sent for manual review?

The current response model includes:

- `verificationStatus`
- `confidence`
- `selectedSource`
- `matchedName`
- `matchedCountryCode`
- `registryName`
- `registryId`
- `officialStatus`
- `websiteMatch`
- `attemptedSources`
- `evidenceUrls`
- `riskFlags`
- `notes`

## Current Coverage

Live adapters currently exist for:

- United States via ProPublica Nonprofit Explorer
- United Kingdom via CharityBase GraphQL
- Czech Republic via ARES
- Israel via public amutot / halatz datasets
- Brazil via OpenCNPJ
- Hong Kong via the IRD Section 88 list
- Taiwan via Ministry of Finance nonprofit CSV data
- Mexico via SAT authorized donees reports

Conditional adapter:

- Ukraine via the official nonprofit tax registry API when `UKRAINE_TAX_TOKEN` is configured

Planned adapters are listed in the source configuration for countries such as Canada, Australia, New Zealand, Ireland, and India.

## Requirements

- Node.js `>=22`
- npm `>=10.9.2`

## Setup

Install dependencies:

```bash
npm install
```

Type-check the project:

```bash
npm run check
```

Build the project:

```bash
npm run build
```

## Environment Variables

Some adapters require credentials or access tokens:

- `CHARITYBASE_API_KEY` for UK lookups
- `UKRAINE_TAX_TOKEN` for Ukraine lookups

Create a local `.env` file if your runtime loads environment variables from it, and do not commit that file to GitHub.

## Project Structure

```text
.
├── src/
│   └── index.ts
├── worker/
│   └── src/
├── package.json
└── tsconfig.json
```

## Notes

- Country routing currently depends on a supplied country code for reliable verification.
- Some adapters provide strong charitable-status evidence, while others mainly confirm legal-entity existence and may still require manual review.
- Confidence scoring is heuristic and intended to support decision-making, not replace human review in ambiguous cases.

## Publishing To GitHub

Before publishing, make sure you keep local-only files out of the repository, especially:

- `node_modules/`
- `dist/`
- `.env` files
- local worker config files such as `workers.json`

This repository now includes a `.gitignore` that covers those defaults.
