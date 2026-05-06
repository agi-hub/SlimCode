import type OpenAI from "openai"

const SEARCH_FILES_DESCRIPTION = `Regex search across files in a directory with context-rich results. Use for finding code patterns, function definitions, TODO comments, or any text across the project.

Parameters:
- path: (required) Directory to search recursively (relative to workspace).
- regex: (required) Rust-compatible regex pattern.
- file_pattern: (optional) Glob to filter files (e.g., *.ts). Defaults to all files.`

const PATH_PARAMETER_DESCRIPTION = `Directory to search recursively (relative to workspace)`

const REGEX_PARAMETER_DESCRIPTION = `Rust-compatible regular expression pattern`

const FILE_PATTERN_PARAMETER_DESCRIPTION = `Optional glob to filter files (e.g., *.ts)`

export default {
	type: "function",
	function: {
		name: "search_files",
		description: SEARCH_FILES_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: PATH_PARAMETER_DESCRIPTION,
				},
				regex: {
					type: "string",
					description: REGEX_PARAMETER_DESCRIPTION,
				},
				file_pattern: {
					type: ["string", "null"],
					description: FILE_PATTERN_PARAMETER_DESCRIPTION,
				},
			},
			required: ["path", "regex", "file_pattern"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
