import { Hono, Context, Next } from "hono";
import { Env } from "./types";
import { GeminiRoute } from "./routes/gemini";
import { DebugRoute } from "./routes/debug";
import { geminiApiKeyAuth } from "./middlewares/auth";
import { loggingMiddleware } from "./middlewares/logging";
import { proxyAwareFetch } from "./utils/proxy-aware-fetch";

/**
 * Gemini CLI as API Server
 *
 * A Bun-powered server that provides Gemini-native API endpoints
 * for Google's Gemini models via the Gemini CLI OAuth flow.
 *
 * Features:
 * - Gemini-native API endpoints for LiteLLM gemini/ prefix support
 * - OAuth2 authentication with file-based token caching
 * - Support for multiple Gemini models (2.5 Pro, 2.0 Flash, 1.5 Pro, etc.)
 * - Debug and testing endpoints for troubleshooting
 * - Native TypeScript execution via Bun runtime
 */

// Create the main Hono app
const app = new Hono<{ Bindings: Env }>();

// Add logging middleware
app.use("*", loggingMiddleware);

// Add CORS headers for all requests
app.use("*", async (c: Context<{ Bindings: Env }>, next: Next) => {
	// Set CORS headers
	c.header("Access-Control-Allow-Origin", "*");
	c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-goog-api-key");

	// Handle preflight requests
	if (c.req.method === "OPTIONS") {
		c.status(204);
		return c.body(null);
	}

	await next();
});

// Apply Gemini API key authentication middleware to all /gemini routes
app.use("/gemini/*", geminiApiKeyAuth);

// Setup route handlers
app.route("/debug", DebugRoute);
app.route("/gemini", GeminiRoute);

// Root endpoint - basic info about the service
app.get("/", (c: Context<{ Bindings: Env }>) => {
	const requiresGeminiAuth = !!process.env.GEMINI_API_KEY;

	return c.json({
		name: "Gemini CLI as API Worker",
		description: "Gemini-native API for Google Gemini models via OAuth",
		version: "1.1.0",
		authentication: {
			required: requiresGeminiAuth,
			type: requiresGeminiAuth ? "x-goog-api-key header, ?key= query parameter, or Bearer token" : "None"
		},
		endpoints: {
			gemini_native: {
				models: "/gemini/models",
				generate_content: "/gemini/models/{model}:generateContent",
				stream_generate_content: "/gemini/models/{model}:streamGenerateContent"
			},
			debug: {
				cache: "/debug/cache",
				token_test: "/debug/token-test",
				full_test: "/debug/test"
			}
		},
		documentation: "https://github.com/gewoonjaap/gemini-cli-openai"
	});
});

// Health check endpoint
app.get("/health", (c: Context) => {
	return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// IP check endpoint - fetches public IP from ifconfig.me to verify proxy is working
app.get("/ip", async (c: Context<{ Bindings: Env }>) => {
	try {
		const proxyUrl = process.env.HTTP_PROXY;

		// Using proxy-aware fetch to respect HTTP_PROXY environment variable
		const response = await proxyAwareFetch("https://api.ipify.org?format=json", {
			headers: { "User-Agent": "curl/7.64.1" }
		});

		if (!response.ok) {
			return c.json({
				error: "Failed to fetch IP",
				status: response.status,
				statusText: response.statusText
			}, 500);
		}

		const ip = (await response.text()).trim();

		return c.json({
			ip,
			timestamp: new Date().toISOString(),
			proxy: {
				configured: proxyUrl || "not set"
			}
		});
	} catch (error) {
		return c.json({
			error: "Failed to fetch IP",
			message: error instanceof Error ? error.message : String(error),
			timestamp: new Date().toISOString()
		}, 500);
	}
});

export default app;
