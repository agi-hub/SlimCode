import type OpenAI from "openai"

const LIST_FILES_DESCRIPTION = `List files and directories within a directory. Do not use to verify file creation — the user will confirm that.

Parameters:
- path: (required) Directory to list (relative to workspace).
- recursive: (required) true for recursive listing; false for top-level only.`

const PATH_PARAMETER_DESCRIPTION = `Directory to list (relative to workspace)`

const RECURSIVE_PARAMETER_DESCRIPTION = `true for recursive; false for top-level only`

export default {
	type: "function",
	function: {
		name: "list_files",
		description: LIST_FILES_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: PATH_PARAMETER_DESCRIPTION,
				},
				recursive: {
					type: "boolean",
					description: RECURSIVE_PARAMETER_DESCRIPTION,
				},
			},
			required: ["path", "recursive"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
