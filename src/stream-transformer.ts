import { GeminiNativeResponse, GeminiNativeStreamChunk } from "./types/gemini-native";

/**
 * Type guard for Gemini native response
 */
function isGeminiNativeResponse(data: unknown): data is GeminiNativeResponse {
	return typeof data === "object" && data !== null && "candidates" in data;
}

/**
 * Creates a TransformStream to pass through Gemini native format
 * as server-sent events (SSE) for LiteLLM gemini/ prefix support.
 *
 * This transformer outputs Gemini API format directly without conversion,
 * preserving thought_signature and other native fields.
 */
export function createGeminiNativeStreamTransformer(): TransformStream<
	GeminiNativeStreamChunk,
	Uint8Array
> {
	const encoder = new TextEncoder();

	return new TransformStream<GeminiNativeStreamChunk, Uint8Array>({
		transform(chunk, controller) {
			if (chunk.type === "gemini_native" && isGeminiNativeResponse(chunk.data)) {
				// Output Gemini native format as SSE
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk.data)}\n\n`));
			}
		},
		flush(controller) {
			// Gemini API doesn't use [DONE] marker
		}
	});
}
