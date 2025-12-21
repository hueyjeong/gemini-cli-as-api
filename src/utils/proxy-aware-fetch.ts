/**
 * Proxy-aware fetch wrapper for Bun
 * Uses undici's ProxyAgent to support HTTP_PROXY environment variable
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

let proxyAgent: ProxyAgent | null = null;

/**
 * Initialize proxy agent from environment variable
 */
function getProxyAgent(): ProxyAgent | null {
	if (proxyAgent) return proxyAgent;
	
	const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
	if (!proxyUrl) return null;
	
	console.log(`[Proxy] Using proxy: ${proxyUrl}`);
	proxyAgent = new ProxyAgent(proxyUrl);
	return proxyAgent;
}

/**
 * Proxy-aware fetch that respects HTTP_PROXY environment variable
 * Falls back to Bun's native fetch if no proxy is configured
 */
export async function proxyAwareFetch(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<Response> {
	const agent = getProxyAgent();
	
	if (!agent) {
		// No proxy configured, use Bun's native fetch
		return fetch(input, init);
	}
	
	// Use undici's fetch with proxy agent
	return undiciFetch(input, {
		...init,
		dispatcher: agent
	}) as Promise<Response>;
}

/**
 * Export as default for easy import replacement
 */
export default proxyAwareFetch;

