import { NativeToolResponse } from "./types/native-tools";

// --- Safety Threshold Types ---
export type SafetyThreshold =
	| "BLOCK_NONE"
	| "BLOCK_FEW"
	| "BLOCK_SOME"
	| "BLOCK_ONLY_HIGH"
	| "HARM_BLOCK_THRESHOLD_UNSPECIFIED";

// --- Environment Variable Typings ---
export interface Env {
	GCP_SERVICE_ACCOUNT: string; // Now contains OAuth2 credentials JSON
	GEMINI_PROJECT_ID?: string;
	GEMINI_CLI_KV: KVNamespace; // Cloudflare KV for token caching
	GEMINI_API_KEY?: string; // Optional API key for authentication (Google-style, AIza...)
	ENABLE_FAKE_THINKING?: string; // Optional flag to enable fake thinking output (set to "true" to enable)
	ENABLE_REAL_THINKING?: string; // Optional flag to enable real Gemini thinking output (set to "true" to enable)
	STREAM_THINKING_AS_CONTENT?: string; // Optional flag to stream thinking as content with <thinking> tags (set to "true" to enable)
	ENABLE_AUTO_MODEL_SWITCHING?: string; // Optional flag to enable automatic fallback from pro to flash on 429 errors (set to "true" to enable)
	GEMINI_MODERATION_HARASSMENT_THRESHOLD?: SafetyThreshold;
	GEMINI_MODERATION_HATE_SPEECH_THRESHOLD?: SafetyThreshold;
	GEMINI_MODERATION_SEXUALLY_EXPLICIT_THRESHOLD?: SafetyThreshold;
	GEMINI_MODERATION_DANGEROUS_CONTENT_THRESHOLD?: SafetyThreshold;

	// Native Tools Configuration
	ENABLE_GEMINI_NATIVE_TOOLS?: string; // Enable native Gemini tools (default: false)
	ENABLE_GOOGLE_SEARCH?: string; // Enable Google Search tool (default: false)
	ENABLE_URL_CONTEXT?: string; // Enable URL Context tool (default: false)
	GEMINI_TOOLS_PRIORITY?: string; // Tool priority strategy (native_first, custom_first, user_choice)
	DEFAULT_TO_NATIVE_TOOLS?: string; // Default behavior when no custom tools provided (default: true)
	ALLOW_REQUEST_TOOL_CONTROL?: string; // Allow request-level tool control (default: true)

	// Citations and Grounding Configuration
	ENABLE_INLINE_CITATIONS?: string; // Enable inline citations in responses (default: false)
	INCLUDE_GROUNDING_METADATA?: string; // Include grounding metadata in responses (default: true)
	INCLUDE_SEARCH_ENTRY_POINT?: string; // Include search entry point HTML (default: false)

	// HTTP Proxy Configuration (for routing requests through a proxy server)
	HTTP_PROXY?: string; // HTTP proxy URL (e.g., http://proxy-host:3128)
}

// --- OAuth2 Credentials Interface ---
export interface OAuth2Credentials {
	access_token: string;
	refresh_token: string;
	scope: string;
	token_type: string;
	id_token: string;
	expiry_date: number;
}

// --- Model Information Interface ---
export interface ModelInfo {
	maxTokens: number;
	contextWindow: number;
	supportsImages: boolean;
	supportsPromptCache: boolean;
	inputPrice: number;
	outputPrice: number;
	description: string;
	thinking: boolean; // Indicates if the model supports thinking
}

export type EffortLevel = "none" | "low" | "medium" | "high";

// --- Gemini Specific Types ---
export interface GeminiFunctionCall {
	name: string;
	args: object;
}
