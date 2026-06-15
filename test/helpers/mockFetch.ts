export function installMockFetch(
	handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
	const originalFetch = globalThis.fetch;

	globalThis.fetch = handler as typeof fetch;

	return () => {
		globalThis.fetch = originalFetch;
	};
}

export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json",
		},
	});
}

export function textResponse(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/plain; charset=utf-8",
		},
	});
}
