import type OpenAI from "openai"

const CODEBASE_SEARCH_DESCRIPTION = `Semantic search over the workspace — finds files by meaning, not exact text. Use the user's exact wording when possible. Queries MUST be in English.

CRITICAL: For any code area you haven't examined yet, use this tool FIRST before search_files or other exploration tools. This applies throughout the entire conversation.

Parameters:
- query: (required) Meaning-based search query.
- path: (optional) Subdirectory to limit scope (relative to workspace); omit for entire workspace.`

const QUERY_PARAMETER_DESCRIPTION = `Meaning-based search query`

const PATH_PARAMETER_DESCRIPTION = `Optional subdirectory (relative to workspace) to limit scope`

export default {
	type: "function",
	function: {
		name: "codebase_search",
		description: CODEBASE_SEARCH_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: QUERY_PARAMETER_DESCRIPTION,
				},
				path: {
					type: ["string", "null"],
					description: PATH_PARAMETER_DESCRIPTION,
				},
			},
			required: ["query", "path"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
