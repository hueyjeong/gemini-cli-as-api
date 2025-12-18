import { geminiCliModels } from "../models";
import {
	DEFAULT_THINKING_BUDGET,
	REASONING_EFFORT_BUDGETS,
	GEMINI_SAFETY_CATEGORIES
} from "../constants";
import { Env, EffortLevel, SafetyThreshold } from "../types";

// Keys that Gemini API does not support and should be removed from tool parameters
const UNSUPPORTED_SCHEMA_KEYS = [
	"$schema",
	"$id",
	"$ref",
	"$defs",
	"$comment",
	"const",
	"anyOf",
	"oneOf",
	"allOf",
	"not",
	"if",
	"then",
	"else",
	"dependentSchemas",
	"dependentRequired",
	"additionalItems",
	"unevaluatedItems",
	"unevaluatedProperties",
	"contentEncoding",
	"contentMediaType",
	"contentSchema",
	"deprecated",
	"readOnly",
	"writeOnly",
	"examples",
	"default",
	"definitions",
	"strict"
];

/**
 * Recursively sanitizes a JSON Schema object by removing unsupported keys for Gemini API.
 * Also ensures 'required' array only contains fields that exist in 'properties'.
 */
export function sanitizeSchemaForGemini(schema: unknown): unknown {
	if (schema === null || schema === undefined) {
		return schema;
	}

	if (Array.isArray(schema)) {
		return schema.map((item) => sanitizeSchemaForGemini(item));
	}

	if (typeof schema === "object") {
		const schemaObj = schema as Record<string, unknown>;
		const sanitized: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(schemaObj)) {
			// Skip unsupported keys
			if (UNSUPPORTED_SCHEMA_KEYS.includes(key) || key.startsWith("$")) {
				continue;
			}

			// Recursively sanitize nested objects
			sanitized[key] = sanitizeSchemaForGemini(value);
		}

		// If this object has both 'properties' and 'required', ensure required fields exist in properties
		if (sanitized.properties && sanitized.required && Array.isArray(sanitized.required)) {
			const properties = sanitized.properties as Record<string, unknown>;
			const propertyNames = Object.keys(properties);
			sanitized.required = (sanitized.required as string[]).filter((field) => propertyNames.includes(field));
		}

		// Convert type to lowercase for Gemini API compatibility
		if (typeof sanitized.type === "string") {
			sanitized.type = sanitized.type.toLowerCase();
		}

		return sanitized;
	}

	return schema;
}

/**
 * Helper class to validate and correct generation configurations for different Gemini models.
 * Handles model-specific limitations and provides sensible defaults.
 */
export class GenerationConfigValidator {
	/**
	 * Maps reasoning effort to thinking budget based on model type.
	 */
	static mapEffortToThinkingBudget(effort: EffortLevel, modelId: string): number {
		const isFlashModel = modelId.includes("flash");

		switch (effort) {
			case "none":
				return REASONING_EFFORT_BUDGETS.none;
			case "low":
				return REASONING_EFFORT_BUDGETS.low;
			case "medium":
				return isFlashModel ? REASONING_EFFORT_BUDGETS.medium.flash : REASONING_EFFORT_BUDGETS.medium.default;
			case "high":
				return isFlashModel ? REASONING_EFFORT_BUDGETS.high.flash : REASONING_EFFORT_BUDGETS.high.default;
			default:
				return DEFAULT_THINKING_BUDGET;
		}
	}

	/**
	 * Type guard to check if a value is a valid EffortLevel.
	 */
	static isValidEffortLevel(value: unknown): value is EffortLevel {
		return typeof value === "string" && ["none", "low", "medium", "high"].includes(value);
	}

	/**
	 * Creates safety settings configuration for Gemini API.
	 */
	static createSafetySettings(env: Env): Array<{ category: string; threshold: SafetyThreshold }> {
		const safetySettings: Array<{ category: string; threshold: SafetyThreshold }> = [];

		if (env.GEMINI_MODERATION_HARASSMENT_THRESHOLD) {
			safetySettings.push({
				category: GEMINI_SAFETY_CATEGORIES.HARASSMENT,
				threshold: env.GEMINI_MODERATION_HARASSMENT_THRESHOLD
			});
		}

		if (env.GEMINI_MODERATION_HATE_SPEECH_THRESHOLD) {
			safetySettings.push({
				category: GEMINI_SAFETY_CATEGORIES.HATE_SPEECH,
				threshold: env.GEMINI_MODERATION_HATE_SPEECH_THRESHOLD
			});
		}

		if (env.GEMINI_MODERATION_SEXUALLY_EXPLICIT_THRESHOLD) {
			safetySettings.push({
				category: GEMINI_SAFETY_CATEGORIES.SEXUALLY_EXPLICIT,
				threshold: env.GEMINI_MODERATION_SEXUALLY_EXPLICIT_THRESHOLD
			});
		}

		if (env.GEMINI_MODERATION_DANGEROUS_CONTENT_THRESHOLD) {
			safetySettings.push({
				category: GEMINI_SAFETY_CATEGORIES.DANGEROUS_CONTENT,
				threshold: env.GEMINI_MODERATION_DANGEROUS_CONTENT_THRESHOLD
			});
		}

		return safetySettings;
	}

	/**
	 * Validates and corrects the thinking budget for a specific model.
	 */
	static validateThinkingBudget(modelId: string, thinkingBudget: number): number {
		const modelInfo = geminiCliModels[modelId];

		if (modelInfo?.thinking) {
			if (thinkingBudget === 0) {
				return DEFAULT_THINKING_BUDGET; // -1
			}

			if (thinkingBudget < -1) {
				return DEFAULT_THINKING_BUDGET; // -1
			}
		}

		return thinkingBudget;
	}
}
