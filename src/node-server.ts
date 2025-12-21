/**
 * Bun HTTP Server wrapper for the Hono app
 * Bun natively supports HTTP_PROXY environment variable
 */

import app from "./index";

const port = parseInt(process.env.PORT || "8787", 10);

console.log(`[Bun Server] Starting server on port ${port}...`);
console.log(`[Bun Server] HTTP_PROXY: ${process.env.HTTP_PROXY || "not set"}`);
console.log(`[Bun Server] HTTPS_PROXY: ${process.env.HTTPS_PROXY || "not set"}`);

// Bun's native server with proxy support
export default {
	port,
	fetch: app.fetch,
	// Bun automatically respects HTTP_PROXY and HTTPS_PROXY environment variables
};

console.log(`[Bun Server] Server is running on http://localhost:${port}`);
