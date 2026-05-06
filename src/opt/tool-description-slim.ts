import type OpenAI from "openai"
import { isMcpTool } from "../utils/mcp-name"

/**
 * Slim down MCP tool definitions to reduce token usage in the tools array.
 *
 * Only MCP tools (identified by the "mcp--" prefix) are affected.
 * Native tools are passed through unchanged.
 *
 * For MCP tools that have NOT been used in the current task:
 * - description is truncated to the first sentence / line (max `maxDescriptionLength` chars)
 * - optional (non-required) parameters drop `enum`, `default`, `examples` and have
 *   their description truncated to the first sentence
 *
 * Tools that appear in `usedToolNames` keep their full definitions so the model
 * retains rich context about tools it is actually using.
 *
 * Enable via OptConfig.slimMcpToolDescriptions (default: false).
 */
export function slimMcpToolDefinitions(
	tools: OpenAI.Chat.ChatCompletionTool[],
	usedToolNames: Set<string>,
	opts?: {
		maxDescriptionLength?: number
		slimSchema?: boolean
	},
): OpenAI.Chat.ChatCompletionTool[] {
	const maxDescLen = opts?.maxDescriptionLength ?? 120
	const slimSchema = opts?.slimSchema ?? true

	return tools.map((tool) => {
		const name =
			tool.type === "function" ? (tool as OpenAI.Chat.ChatCompletionFunctionTool).function.name : undefined

		// Only slim MCP tools that haven't been used in this task.
		if (!name || !isMcpTool(name) || usedToolNames.has(name)) {
			return tool
		}

		const fn = (tool as OpenAI.Chat.ChatCompletionFunctionTool).function

		const slimmedDescription = fn.description ? truncateToFirstSentence(fn.description, maxDescLen) : undefined

		let slimmedParameters = fn.parameters
		if (slimSchema && fn.parameters && typeof fn.parameters === "object") {
			slimmedParameters = slimParameters(fn.parameters as Record<string, unknown>)
		}

		return {
			...tool,
			function: {
				...fn,
				...(slimmedDescription !== undefined ? { description: slimmedDescription } : {}),
				parameters: slimmedParameters,
			},
		} as OpenAI.Chat.ChatCompletionTool
	})
}

/**
 * Truncate text to the first sentence ending (. ! ?) or first newline,
 * whichever comes first, up to maxLength characters.
 */
function truncateToFirstSentence(text: string, maxLength: number): string {
	// Find the end of the first sentence or line
	const sentenceEnd = text.search(/[.!?]\s/)
	const lineEnd = text.indexOf("\n")

	let cutAt = -1
	if (sentenceEnd >= 0) cutAt = sentenceEnd + 1
	if (lineEnd >= 0 && (cutAt < 0 || lineEnd < cutAt)) cutAt = lineEnd

	let result = cutAt > 0 ? text.slice(0, cutAt).trim() : text

	if (result.length > maxLength) {
		result = result.slice(0, maxLength - 3) + "..."
	}

	return result
}

/**
 * Remove verbose optional-parameter metadata (enum, default, examples)
 * and truncate optional parameter descriptions to first sentence.
 */
function slimParameters(params: Record<string, unknown>): Record<string, unknown> {
	if (typeof params !== "object" || params === null) return params

	const required = Array.isArray(params.required) ? (params.required as string[]) : []

	const properties = params.properties as Record<string, Record<string, unknown>> | undefined
	if (!properties) return params

	const slimmedProperties: Record<string, Record<string, unknown>> = {}
	for (const [propName, propSchema] of Object.entries(properties)) {
		if (required.includes(propName)) {
			// Keep required parameter schemas intact.
			slimmedProperties[propName] = propSchema
		} else {
			// For optional parameters: keep only type + truncated description.
			const slim: Record<string, unknown> = {}
			if (propSchema.type !== undefined) slim.type = propSchema.type
			if (typeof propSchema.description === "string") {
				slim.description = truncateToFirstSentence(propSchema.description, 80)
			}
			slimmedProperties[propName] = slim
		}
	}

	return { ...params, properties: slimmedProperties }
}
