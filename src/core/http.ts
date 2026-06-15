export async function fetchJson<T>(
	url: string,
	init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; errorNote: string }> {
	try {
		const response = await fetch(url, {
			...init,
			headers: {
				Accept: "application/json, text/csv;q=0.9, */*;q=0.8",
				"User-Agent": "Mozilla/5.0",
				...(init?.headers ?? {}),
			},
		});

		if (!response.ok) {
			return { ok: false, errorNote: `Request failed with HTTP ${response.status}.` };
		}

		return { ok: true, data: (await response.json()) as T };
	} catch (error) {
		return {
			ok: false,
			errorNote: error instanceof Error ? error.message : "Unknown fetch error.",
		};
	}
}

export async function fetchText(
	url: string,
	init?: RequestInit,
): Promise<{ ok: true; text: string } | { ok: false; errorNote: string }> {
	try {
		const response = await fetch(url, {
			...init,
			headers: {
				Accept: "text/csv, text/plain;q=0.9, */*;q=0.8",
				"User-Agent": "Mozilla/5.0",
				...(init?.headers ?? {}),
			},
		});

		if (!response.ok) {
			return { ok: false, errorNote: `Request failed with HTTP ${response.status}.` };
		}

		return { ok: true, text: await response.text() };
	} catch (error) {
		return {
			ok: false,
			errorNote: error instanceof Error ? error.message : "Unknown fetch error.",
		};
	}
}
