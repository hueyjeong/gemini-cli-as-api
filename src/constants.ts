/**
 * Constants for the Gemini CLI Native API Worker
 */

// Thinking budget constants
export const DEFAULT_THINKING_BUDGET = -1; // -1 means dynamic allocation by Gemini (recommended)

// Generation config defaults
export const DEFAULT_TEMPERATURE = 0.7;

// Auto model switching configuration
export const AUTO_SWITCH_MODEL_MAP = {
	"gemini-3-pro-preview": "gemini-3-flash-preview",
	"gemini-2.5-pro": "gemini-2.5-flash"
} as const;

// HTTP status codes for rate limiting
export const RATE_LIMIT_STATUS_CODES = [429, 503] as const;

// Reasoning effort mapping to thinking budgets
export const REASONING_EFFORT_BUDGETS = {
	none: 0,
	low: 1024,
	medium: {
		flash: 12288,
		default: 16384
	},
	high: {
		flash: 24576,
		default: 32768
	}
} as const;

// Gemini safety categories
export const GEMINI_SAFETY_CATEGORIES = {
	HARASSMENT: "HARM_CATEGORY_HARASSMENT",
	HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
	SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
	DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT"
} as const;

// Native tools defaults
export const NATIVE_TOOLS_DEFAULTS = {
	ENABLE_GEMINI_NATIVE_TOOLS: false,
	ENABLE_GOOGLE_SEARCH: false,
	ENABLE_URL_CONTEXT: false,
	GEMINI_TOOLS_PRIORITY: "native_first",
	DEFAULT_TO_NATIVE_TOOLS: true,
	ALLOW_REQUEST_TOOL_CONTROL: true,
	ENABLE_INLINE_CITATIONS: false,
	INCLUDE_GROUNDING_METADATA: true,
	INCLUDE_SEARCH_ENTRY_POINT: false
} as const;
