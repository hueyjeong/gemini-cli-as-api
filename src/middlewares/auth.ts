import { MiddlewareHandler } from "hono";
import { Env } from "../types";

/**
 * Middleware to enforce Google-style API key authentication if GEMINI_API_KEY is set in the environment.
 * Supports both 'x-goog-api-key' header and '?key=' query parameter (Google API style).
 */
export const geminiApiKeyAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	// Skip authentication for public endpoints
	const publicEndpoints = ["/", "/health"];
	if (publicEndpoints.some((endpoint) => c.req.path === endpoint)) {
		await next();
		return;
	}

	// If GEMINI_API_KEY is set in environment, require authentication
	if (c.env.GEMINI_API_KEY) {
		// Check x-goog-api-key header first (primary method)
		let providedKey: string | undefined = c.req.header("x-goog-api-key");

		// Fallback to ?key= query parameter (Google API style)
		if (!providedKey) {
			providedKey = c.req.query("key") || undefined;
		}

		// Also support Authorization: Bearer for compatibility
		if (!providedKey) {
			const authHeader = c.req.header("Authorization");
			if (authHeader) {
				const match = authHeader.match(/^Bearer\s+(.+)$/);
				if (match) {
					providedKey = match[1];
				}
			}
		}

		if (!providedKey) {
			return c.json(
				{
					error: {
						message: "Missing API key. Provide via 'x-goog-api-key' header or '?key=' query parameter.",
						code: 401,
						status: "UNAUTHENTICATED"
					}
				},
				401
			);
		}

		if (providedKey !== c.env.GEMINI_API_KEY) {
			return c.json(
				{
					error: {
						message: "Invalid API key",
						code: 401,
						status: "UNAUTHENTICATED"
					}
				},
				401
			);
		}
	}

	await next();
};
