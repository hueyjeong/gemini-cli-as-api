import { Env, OAuth2Credentials } from "./types";
import {
	CODE_ASSIST_ENDPOINT,
	CODE_ASSIST_API_VERSION,
	OAUTH_CLIENT_ID,
	OAUTH_CLIENT_SECRET,
	OAUTH_REFRESH_URL,
	TOKEN_BUFFER_TIME,
	KV_TOKEN_KEY
} from "./config";
import { proxyAwareFetch } from "./utils/proxy-aware-fetch";

// Auth-related interfaces
interface TokenRefreshResponse {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
}

interface CachedTokenData {
	access_token: string;
	refresh_token?: string;
	expiry_date: number;
	cached_at: number;
}

interface TokenCacheInfo {
	cached: boolean;
	cached_at?: string;
	expires_at?: string;
	time_until_expiry_seconds?: number;
	is_expired?: boolean;
	message?: string;
	error?: string;
}

/**
 * Handles OAuth2 authentication and Google Code Assist API communication.
 * Manages token caching, refresh, and API calls.
 */
export class AuthManager {
	private accessToken: string | null = null;

	// Use process.env directly for Bun compatibility
	private get GCP_SERVICE_ACCOUNT(): string | undefined {
		return process.env.GCP_SERVICE_ACCOUNT;
	}

	constructor(_env?: Env) {
		// env parameter kept for backward compatibility but not used
		// Bun uses process.env directly
	}

	/**
	 * Initializes authentication using OAuth2 credentials with file-based caching.
	 */
	public async initializeAuth(): Promise<void> {
		if (!this.GCP_SERVICE_ACCOUNT) {
			throw new Error("`GCP_SERVICE_ACCOUNT` environment variable not set. Please provide OAuth2 credentials JSON.");
		}

		try {
			// First, try to get a cached token from file storage
			let cachedTokenData = null;

			try {
				const cachedToken = await this.getTokenFromFile();
				if (cachedToken) {
					cachedTokenData = cachedToken as CachedTokenData;
					console.log("Found cached token in file storage");
				}
			} catch (fileError) {
				console.log("No cached token found in file storage or file error:", fileError);
			}

			// Check if cached token is still valid (with buffer)
			if (cachedTokenData) {
				const timeUntilExpiry = cachedTokenData.expiry_date - Date.now();
				if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
					this.accessToken = cachedTokenData.access_token;
					console.log(`Using cached token, valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`);
					return;
				}
				console.log("Cached access token expired or expiring soon");

				// Try to refresh using cached refresh token if available
				if (cachedTokenData.refresh_token) {
					console.log("Found cached refresh token, attempting to refresh...");
					try {
						await this.refreshAndCacheToken(cachedTokenData.refresh_token);
						return;
					} catch (refreshError) {
						console.warn("Failed to refresh using cached refresh token, falling back to env credentials:", refreshError);
						// Fall through to env credentials
					}
				}
			}

			// Parse original credentials from environment
			const oauth2Creds: OAuth2Credentials = JSON.parse(this.GCP_SERVICE_ACCOUNT);

			// Check if the original token is still valid
			const timeUntilExpiry = oauth2Creds.expiry_date - Date.now();
			if (timeUntilExpiry > TOKEN_BUFFER_TIME) {
				// Original token is still valid, cache it and use it
				this.accessToken = oauth2Creds.access_token;
				console.log(`Original token is valid for ${Math.floor(timeUntilExpiry / 1000)} more seconds`);

				// Cache the token in file storage
				await this.cacheTokenToFile(oauth2Creds.access_token, oauth2Creds.expiry_date, oauth2Creds.refresh_token);
				return;
			}

			// Both original and cached tokens are expired, refresh the token
			console.log("All tokens expired, refreshing using env credentials...");
			await this.refreshAndCacheToken(oauth2Creds.refresh_token);
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			console.error("Failed to initialize authentication:", e);
			throw new Error("Authentication failed: " + errorMessage);
		}
	}

	/**
	 * Refresh the OAuth token and cache it in file storage.
	 */
	private async refreshAndCacheToken(refreshToken: string): Promise<void> {
		console.log("Refreshing OAuth token...");

		const refreshResponse = await proxyAwareFetch(OAUTH_REFRESH_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				client_id: OAUTH_CLIENT_ID,
				client_secret: OAUTH_CLIENT_SECRET,
				refresh_token: refreshToken,
				grant_type: "refresh_token"
			})
		});

		if (!refreshResponse.ok) {
			const errorText = await refreshResponse.text();
			console.error("Token refresh failed:", errorText);
			throw new Error(`Token refresh failed: ${errorText}`);
		}

		const refreshData = (await refreshResponse.json()) as TokenRefreshResponse;
		this.accessToken = refreshData.access_token;

		// Calculate expiry time (typically 1 hour from now)
		const expiryTime = Date.now() + refreshData.expires_in * 1000;

		console.log("Token refreshed successfully");
		console.log(`New token expires in ${refreshData.expires_in} seconds`);

		// Use new refresh token if provided, otherwise keep using the one we have
		let nextRefreshToken = refreshToken;
		if (refreshData.refresh_token) {
			console.log("Received new refresh token from Google, updating cache...");
			nextRefreshToken = refreshData.refresh_token;
		}

		// Cache the new token in file storage
		await this.cacheTokenToFile(refreshData.access_token, expiryTime, nextRefreshToken);
	}

	/**
	 * Get token from file storage (Bun compatible).
	 */
	private async getTokenFromFile(): Promise<CachedTokenData | null> {
		try {
			const tokenPath = "/app/data/token-cache.json";
			
			// Check if file exists (Bun-specific)
			const file = Bun.file(tokenPath);
			if (!(await file.exists())) {
				return null;
			}
			
			const content = await file.text();
			return JSON.parse(content) as CachedTokenData;
		} catch (error) {
			console.error("Error reading token from file:", error);
			return null;
		}
	}

	/**
	 * Cache the access token in file storage (Bun compatible).
	 */
	private async cacheTokenToFile(accessToken: string, expiryDate: number, refreshToken?: string): Promise<void> {
		try {
			const tokenData: CachedTokenData = {
				access_token: accessToken,
				refresh_token: refreshToken,
				expiry_date: expiryDate,
				cached_at: Date.now()
			};

			const tokenPath = "/app/data/token-cache.json";
			
			// Ensure directory exists
			await Bun.write(tokenPath, JSON.stringify(tokenData, null, 2));
			console.log("Token cached in file storage");
		} catch (fileError) {
			console.error("Failed to cache token in file storage:", fileError);
			// Don't throw an error here as the token is still valid, just not cached
		}
	}

	/**
	 * Clear cached token from file storage.
	 */
	public async clearTokenCache(): Promise<void> {
		try {
			const tokenPath = "/app/data/token-cache.json";
			const file = Bun.file(tokenPath);
			
			if (await file.exists()) {
				// Delete file by writing empty content (Bun doesn't have a direct delete API)
				await Bun.write(tokenPath, "");
				console.log("Cleared cached token from file storage");
			}
		} catch (fileError) {
			console.log("Error clearing file cache:", fileError);
		}
	}

	/**
	 * Get cached token info from file storage.
	 */
	public async getCachedTokenInfo(): Promise<TokenCacheInfo> {
		try {
			const cachedToken = await this.getTokenFromFile();
			if (cachedToken) {
				const tokenData = cachedToken as CachedTokenData;
				const timeUntilExpiry = tokenData.expiry_date - Date.now();

				return {
					cached: true,
					cached_at: new Date(tokenData.cached_at).toISOString(),
					expires_at: new Date(tokenData.expiry_date).toISOString(),
					time_until_expiry_seconds: Math.floor(timeUntilExpiry / 1000),
					is_expired: timeUntilExpiry < 0
					// Removed token_preview for security
				};
			}
			return { cached: false, message: "No token found in cache" };
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			return { cached: false, error: errorMessage };
		}
	}

	/**
	 * A generic method to call a Code Assist API endpoint.
	 */
	public async callEndpoint(method: string, body: Record<string, unknown>, isRetry: boolean = false): Promise<unknown> {
		await this.initializeAuth();

		const response = await proxyAwareFetch(`${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.accessToken}`
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			if (response.status === 401 && !isRetry) {
				console.log("Got 401 error, clearing token cache and retrying...");
				this.accessToken = null; // Clear cached token
				await this.clearTokenCache(); // Clear file cache
				await this.initializeAuth(); // This will refresh the token
				return this.callEndpoint(method, body, true); // Retry once
			}
			const errorText = await response.text();
			throw new Error(`API call failed with status ${response.status}: ${errorText}`);
		}

		return response.json();
	}

	/**
	 * Get the current access token.
	 */
	public getAccessToken(): string | null {
		return this.accessToken;
	}
}
