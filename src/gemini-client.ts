import {
	Env,
	GeminiFunctionCall
} from "./types";
import { AuthManager } from "./auth";
import { CODE_ASSIST_ENDPOINT, CODE_ASSIST_API_VERSION } from "./config";
import { GenerationConfigValidator, sanitizeSchemaForGemini } from "./helpers/generation-config-validator";
import { AutoModelSwitchingHelper } from "./helpers/auto-model-switching";
import {
	GeminiNativeRequest,
	GeminiNativeResponse,
	GeminiNativeStreamChunk,
	GeminiNativePart
} from "./types/gemini-native";

const CONNECTION_TIMEOUT_MS = 100000; // 100 seconds for initial connection
const IDLE_TIMEOUT_MS = 100000; // 100 seconds for stream idle time
const QUICK_FAIL_THRESHOLD_MS = 5000; // 5 seconds threshold for quick fail retry

interface ProjectDiscoveryResponse {
	cloudaicompanionProject?: string;
}

/**
 * Handles communication with Google's Gemini API through the Code Assist endpoint.
 * Manages project discovery, streaming, and response parsing.
 */
export class GeminiApiClient {
	private env: Env;
	private authManager: AuthManager;
	private projectId: string | null = null;
	private autoSwitchHelper: AutoModelSwitchingHelper;

	constructor(env: Env, authManager: AuthManager) {
		this.env = env;
		this.authManager = authManager;
		this.autoSwitchHelper = new AutoModelSwitchingHelper(env);
	}

	/**
	 * Discovers the Google Cloud project ID. Uses the environment variable if provided.
	 */
	public async discoverProjectId(): Promise<string> {
		if (this.env.GEMINI_PROJECT_ID) {
			return this.env.GEMINI_PROJECT_ID;
		}
		if (this.projectId) {
			return this.projectId;
		}

		try {
			const initialProjectId = "default-project";
			const loadResponse = (await this.authManager.callEndpoint("loadCodeAssist", {
				cloudaicompanionProject: initialProjectId,
				metadata: { duetProject: initialProjectId }
			})) as ProjectDiscoveryResponse;

			if (loadResponse.cloudaicompanionProject) {
				this.projectId = loadResponse.cloudaicompanionProject;
				return loadResponse.cloudaicompanionProject;
			}
			throw new Error("Project ID discovery failed. Please set the GEMINI_PROJECT_ID environment variable.");
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error("Failed to discover project ID:", errorMessage);
			throw new Error(
				"Could not discover project ID. Make sure you're authenticated and consider setting GEMINI_PROJECT_ID."
			);
		}
	}

	/**
	 * Parses a server-sent event (SSE) stream from the Gemini API.
	 */
	private async *parseSSEStream(
		stream: ReadableStream<Uint8Array>,
		idleTimeoutMs?: number
	): AsyncGenerator<any> {
		const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
		let buffer = "";
		let objectBuffer = "";
		let idleTimer: any;

		try {
			while (true) {
				if (idleTimeoutMs) {
					idleTimer = setTimeout(() => {
						console.error(`[GeminiAPI] Stream idle timeout after ${idleTimeoutMs}ms`);
						reader.cancel("IdleTimeout");
					}, idleTimeoutMs);
				}

				let readResult;
				try {
					readResult = await reader.read();
				} catch (error) {
					if (error === "IdleTimeout") {
						throw new Error(`Stream idle timeout after ${idleTimeoutMs}ms`);
					}
					throw error;
				} finally {
					if (idleTimer) clearTimeout(idleTimer);
				}

				const { done, value } = readResult;

				if (done) {
					if (objectBuffer) {
						try {
							yield JSON.parse(objectBuffer);
						} catch (e) {
							console.error("Error parsing final SSE JSON object:", e);
						}
					}
					break;
				}

				buffer += value;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.trim() === "") {
						if (objectBuffer) {
							try {
								yield JSON.parse(objectBuffer);
							} catch (e) {
								console.error("Error parsing SSE JSON object:", e);
							}
							objectBuffer = "";
						}
					} else if (line.startsWith("data: ")) {
						objectBuffer += line.substring(6);
					}
				}
			}
		} finally {
			if (idleTimer) clearTimeout(idleTimer);
			reader.releaseLock();
		}
	}

	/**
	 * Stream content from Gemini API using native Gemini format.
	 */
	async *streamContentNative(
		modelId: string,
		request: GeminiNativeRequest
	): AsyncGenerator<GeminiNativeStreamChunk> {
		await this.authManager.initializeAuth();
		const projectId = await this.discoverProjectId();

		const streamRequest = this.buildNativeStreamRequest(modelId, projectId, request);
		yield* this.performNativeStreamRequest(streamRequest, modelId);
	}

	/**
	 * Get a complete response from Gemini API using native format (non-streaming).
	 */
	async getCompletionNative(
		modelId: string,
		request: GeminiNativeRequest
	): Promise<GeminiNativeResponse> {
		await this.authManager.initializeAuth();
		const projectId = await this.discoverProjectId();

		const streamRequest = this.buildNativeStreamRequest(modelId, projectId, request);

		const candidates: GeminiNativeResponse["candidates"] = [];
		let usageMetadata: GeminiNativeResponse["usageMetadata"] | undefined;

		for await (const chunk of this.performNativeStreamRequest(streamRequest, modelId)) {
			if (chunk.type === "gemini_native" && chunk.data.candidates) {
				for (const candidate of chunk.data.candidates) {
					if (candidates.length === 0) {
						candidates.push({
							content: {
								role: "model",
								parts: []
							}
						});
					}
					if (candidate.content?.parts) {
						candidates[0].content.parts.push(...(candidate.content.parts as GeminiNativePart[]));
					}
					if (candidate.finishReason) {
						candidates[0].finishReason = candidate.finishReason;
					}
					if (candidate.groundingMetadata) {
						candidates[0].groundingMetadata = candidate.groundingMetadata;
					}
				}
				if (chunk.data.usageMetadata) {
					usageMetadata = chunk.data.usageMetadata;
				}
			}
		}

		return {
			candidates,
			usageMetadata,
			modelVersion: modelId
		};
	}

	/**
	 * Logs request body for debugging with masked text content.
	 */
	private logRequestBodyForDebug(streamRequest: Record<string, unknown>, statusCode: number): void {
		return;
		try {
			const debugRequest = JSON.parse(JSON.stringify(streamRequest));
			const req = debugRequest.request as any;

			if (req?.contents && Array.isArray(req.contents)) {
				req.contents.forEach((c: any) => {
					if (c.parts && Array.isArray(c.parts)) {
						c.parts.forEach((p: any) => {
							if (p.text) p.text = `[MASKED_TEXT_LENGTH_${p.text.length}]`;
							if (p.functionResponse?.response) {
								const resp = p.functionResponse.response;
								if (resp.content) resp.content = `[MASKED_CONTENT_LENGTH_${resp.content.length}]`;
								if (resp.result) resp.result = `[MASKED_RESULT_LENGTH_${resp.result.length}]`;
							}
						});
					}
				});
			}

			if (req?.tools && Array.isArray(req.tools)) {
				req.tools.forEach((tool: any) => {
					if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
						tool.functionDeclarations.forEach((fd: any) => {
							if (fd.description) fd.description = `[MASKED_DESC_LENGTH_${fd.description.length}]`;
						});
					}
				});
			}

			console.error(`[GeminiAPI Native] Request Body (Status ${statusCode}):`, JSON.stringify(debugRequest, null, 2));
		} catch (e) {
			console.error("[GeminiAPI Native] Failed to log request body:", e);
		}
	}

	/**
	 * Converts contents from snake_case to camelCase for Gemini API compatibility.
	 */
	private convertContentsToNativeFormat(contents: unknown[]): unknown[] {
		return contents.map((content: any) => {
			if (!content.parts || !Array.isArray(content.parts)) {
				return content;
			}

			let hasFunctionResponse = false;
			let hasFunctionCall = false;

			const convertedParts = content.parts.map((part: any) => {
				const newPart: Record<string, unknown> = {};

				for (const [key, value] of Object.entries(part)) {
					if (key === "function_call") {
						newPart["functionCall"] = value;
						hasFunctionCall = true;
					} else if (key === "function_response") {
						newPart["functionResponse"] = value;
						hasFunctionResponse = true;
					} else if (key === "functionCall") {
						newPart[key] = value;
						hasFunctionCall = true;
					} else if (key === "functionResponse") {
						newPart[key] = value;
						hasFunctionResponse = true;
					} else {
						newPart[key] = value;
					}
				}

				return newPart;
			});

			let role = content.role;
			if (!role) {
				if (hasFunctionResponse) {
					role = "user";
				} else if (hasFunctionCall) {
					role = "model";
				}
			}

			return {
				...content,
				role,
				parts: convertedParts
			};
		});
	}

	/**
	 * Builds the stream request for native Gemini API format.
	 */
	private buildNativeStreamRequest(
		modelId: string,
		projectId: string,
		request: GeminiNativeRequest
	): Record<string, unknown> {
		const generationConfig: Record<string, unknown> = {};

		if (request.generationConfig) {
			//console.log("[GeminiAPI] generationConfig received:", JSON.stringify(request.generationConfig, null, 2));
			const gc = request.generationConfig as any;
			// Copy all properties from request.generationConfig to ensure nothing is missed
			// This handles both camelCase and snake_case properties that might be sent by clients
			for (const [key, value] of Object.entries(gc)) {
				if (value !== undefined) {
					// Convert snake_case keys to camelCase for Gemini API compatibility
					if (key === "thinking_config") {
						generationConfig["thinkingConfig"] = value;
					} else if (key === "max_output_tokens") {
						generationConfig["maxOutputTokens"] = value;
					} else if (key === "stop_sequences") {
						generationConfig["stopSequences"] = value;
					} else if (key === "response_mime_type") {
						generationConfig["responseMimeType"] = value;
					} else if (key === "presence_penalty") {
						generationConfig["presencePenalty"] = value;
					} else if (key === "frequency_penalty") {
						generationConfig["frequencyPenalty"] = value;
					} else {
						generationConfig[key] = value;
					}
				}
			}

			// Special handling for thinkingConfig internal fields to ensure they are in camelCase
			if (generationConfig.thinkingConfig && typeof generationConfig.thinkingConfig === "object") {
				const tc = generationConfig.thinkingConfig as any;
				const newTc: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(tc)) {
					if (key === "include_thoughts") {
						newTc["includeThoughts"] = value;
					} else if (key === "thinking_budget") {
						newTc["thinkingBudget"] = value;
					} else if (key === "thinking_level") {
						newTc["thinkingLevel"] = value;
					} else {
						newTc[key] = value;
					}
				}
				generationConfig.thinkingConfig = newTc;
			}
		} else {
			console.log("[GeminiAPI] generationConfig not received");
		}

		const contents = this.convertContentsToNativeFormat(request.contents);

		const streamRequest: Record<string, unknown> = {
			model: modelId,
			project: projectId,
			request: {
				contents
			}
		};

		if (request.systemInstruction) {
			(streamRequest.request as Record<string, unknown>).systemInstruction = request.systemInstruction;
		}

		if (Object.keys(generationConfig).length > 0) {
			(streamRequest.request as Record<string, unknown>).generationConfig = generationConfig;
		}

		if (request.tools && request.tools.length > 0) {
			const sanitizedTools = request.tools.map((tool: any) => {
				const funcDecls = tool.functionDeclarations || tool.function_declarations;

				if (funcDecls && Array.isArray(funcDecls)) {
					return {
						functionDeclarations: funcDecls.map((fd: any) => ({
							name: fd.name,
							description: fd.description,
							parametersJsonSchema: sanitizeSchemaForGemini(fd.parametersJsonSchema || fd.parameters)
						}))
					};
				}
				return tool;
			});
			(streamRequest.request as Record<string, unknown>).tools = sanitizedTools;
		}

		if (request.toolConfig) {
			(streamRequest.request as Record<string, unknown>).toolConfig = request.toolConfig;
		}

		if (request.safetySettings && request.safetySettings.length > 0) {
			(streamRequest.request as Record<string, unknown>).safetySettings = request.safetySettings;
		} else {
			const safetySettings = GenerationConfigValidator.createSafetySettings(this.env);
			if (safetySettings.length > 0) {
				(streamRequest.request as Record<string, unknown>).safetySettings = safetySettings;
			}
		}

		return streamRequest;
	}

	/**
	 * Performs the native stream request and yields Gemini-native format chunks.
	 */
	private async *performNativeStreamRequest(
		streamRequest: Record<string, unknown>,
		modelId: string,
		isRetry: boolean = false
	): AsyncGenerator<GeminiNativeStreamChunk> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
		const startTime = Date.now();

		try {
			const response = await fetch(`${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:streamGenerateContent?alt=sse`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.authManager.getAccessToken()}`
				},
				body: JSON.stringify(streamRequest),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`[GeminiAPI Native] Stream request failed: ${response.status}`, errorText);

				this.logRequestBodyForDebug(streamRequest, response.status);

				if (response.status === 401 && !isRetry) {
					console.log("Got 401 error in native stream request, clearing token cache and retrying...");
					await this.authManager.clearTokenCache();
					await this.authManager.initializeAuth();
					yield* this.performNativeStreamRequest(streamRequest, modelId, true);
					return;
				}

				if (this.autoSwitchHelper.isRateLimitStatus(response.status) && !isRetry) {
					const fallbackModel = this.autoSwitchHelper.getFallbackModel(modelId);
					if (fallbackModel && this.autoSwitchHelper.isEnabled()) {
						console.log(`Got ${response.status} error for model ${modelId}, switching to fallback model: ${fallbackModel}`);

						// Yield a notification chunk so the user knows a switch occurred
						yield {
							type: "gemini_native",
							data: {
								candidates: [
									{
										content: {
											role: "model",
											parts: [{ text: this.autoSwitchHelper.createSwitchNotification(modelId, fallbackModel) }]
										}
									}
								],
								modelVersion: fallbackModel
							}
						};

						const fallbackRequest = { ...streamRequest, model: fallbackModel };
						yield* this.performNativeStreamRequest(fallbackRequest, fallbackModel, true);
						return;
					}
				}

				throw new Error(`Stream request failed: ${response.status}`);
			}

			if (!response.body) {
				throw new Error("Response has no body");
			}

			for await (const jsonData of this.parseSSEStream(response.body, IDLE_TIMEOUT_MS)) {
				if (jsonData.response?.candidates) {
					const nativeResponse: GeminiNativeResponse = {
						candidates: jsonData.response.candidates.map((candidate: any) => ({
							content: {
								role: "model" as const,
								parts: (candidate.content?.parts || []) as GeminiNativePart[]
							},
							finishReason: candidate.finishReason as any,
							groundingMetadata: candidate.groundingMetadata as Record<string, unknown> | undefined
						})),
						usageMetadata: jsonData.response.usageMetadata
							? {
								promptTokenCount: jsonData.response.usageMetadata.promptTokenCount || 0,
								candidatesTokenCount: jsonData.response.usageMetadata.candidatesTokenCount || 0,
								totalTokenCount:
									(jsonData.response.usageMetadata.promptTokenCount || 0) +
									(jsonData.response.usageMetadata.candidatesTokenCount || 0)
							}
							: undefined,
						modelVersion: modelId
					};

					yield {
						type: "gemini_native",
						data: nativeResponse
					};
				}
			}
		} catch (error: unknown) {
			clearTimeout(timeoutId);
			const duration = Date.now() - startTime;
			const isTimeout = error instanceof Error && error.name === "AbortError";
			const isQuickFail = duration < QUICK_FAIL_THRESHOLD_MS;

			if (!isRetry && (isTimeout || isQuickFail)) {
				const reason = isTimeout ? "Connection Timeout" : "Quick Fail";
				console.log(`[GeminiAPI Native] Request failed (${reason}), retrying...`);
				yield* this.performNativeStreamRequest(streamRequest, modelId, true);
				return;
			}

			throw error;
		}
	}
}
