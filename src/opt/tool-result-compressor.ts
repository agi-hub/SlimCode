import type { Anthropic } from "@anthropic-ai/sdk"
import * as path from "path"

/**
 * Compresses tool result content before writing to API conversation history.
 *
 * Strategies by tool name:
 * - list_files: group files by directory to eliminate repeated path prefixes
 * - read_file: collapse runs of blank lines
 * - execute_command: RLE for repeated identical lines
 * - search_files: cap at 100 matches
 * - general fallback: head+tail truncation at maxChars
 *
 * Only affects the copy written to history; UI display is handled separately.
 */
export function compressToolResultContent(
	toolName: string,
	content: string | Anthropic.ToolResultBlockParam["content"],
	opts?: {
		maxChars?: number
		/** Separate, tighter cap for execute_command output. Defaults to maxChars. */
		maxCommandChars?: number
	},
): string | Anthropic.ToolResultBlockParam["content"] {
	const maxChars = opts?.maxChars ?? 8000
	const maxCommandChars = opts?.maxCommandChars ?? maxChars

	const effectiveMax = resolveMaxChars(toolName, maxChars, maxCommandChars)

	if (typeof content === "string") {
		return compressString(toolName, content, effectiveMax)
	}

	if (Array.isArray(content)) {
		return content.map((block) => {
			if (block.type === "text") {
				return { ...block, text: compressString(toolName, block.text, effectiveMax) }
			}
			return block
		})
	}

	return content
}

function resolveMaxChars(toolName: string, maxChars: number, maxCommandChars: number): number {
	const baseName = toolName.toLowerCase().replace(/^mcp--[^-]+-/, "")
	if (baseName === "execute_command" || baseName === "run_command") {
		return maxCommandChars
	}
	return maxChars
}

function compressString(toolName: string, text: string, maxChars: number): string {
	let result = text

	const baseName = toolName.toLowerCase().replace(/^mcp--[^-]+-/, "")

	if (baseName === "list_files" || baseName === "list_directory") {
		result = compressListFiles(result)
	} else if (baseName === "execute_command" || baseName === "run_command") {
		result = rleCompressLines(result)
	} else if (baseName === "search_files" || baseName === "grep" || baseName === "grep_search") {
		result = capSearchResults(result, 100)
	}
	// NOTE: read_file is intentionally NOT transformed here.
	// The model uses read_file content verbatim to construct oldCode in apply_diff /
	// search_replace / write_to_file edits. Any whitespace or content changes would
	// cause those tools to fail with "oldCode not found" errors.
	// Only the universal head+tail truncation below is applied (which is safe because
	// the model is explicitly told the content was truncated and won't quote missing parts).

	if (result.length > maxChars) {
		result = headTailTruncate(result, maxChars)
	}

	return result
}

/**
 * Group files by their immediate parent directory to remove repeated path prefixes.
 *
 * Input (flat relative paths):
 *   src/core/task/Task.ts
 *   src/core/task/build-tools.ts
 *   src/core/webview/ClineProvider.ts
 *
 * Output (grouped):
 *   src/core/task/ (2 files): Task.ts, build-tools.ts
 *   src/core/webview/ (1 file): ClineProvider.ts
 */
function compressListFiles(content: string): string {
	const lines = content.split("\n")

	// Separate the trailing truncation notice (if any) from file lines
	const truncationMarkerIdx = lines.findIndex(
		(l) => l.startsWith("(File list truncated.") || l.startsWith("(Directory listing truncated"),
	)
	const fileLines = truncationMarkerIdx >= 0 ? lines.slice(0, truncationMarkerIdx) : lines
	const suffix = truncationMarkerIdx >= 0 ? "\n\n" + lines.slice(truncationMarkerIdx).join("\n") : ""

	// Only group if there are enough lines to benefit from grouping
	const GROUPING_THRESHOLD = 15
	if (fileLines.length < GROUPING_THRESHOLD) {
		return content
	}

	// Group by directory
	const dirMap = new Map<string, string[]>()
	const rootFiles: string[] = []

	for (const line of fileLines) {
		const trimmed = line.trim()
		if (!trimmed) continue

		// Directory entries end with /
		if (trimmed.endsWith("/")) {
			// Keep directory entries as-is in a special bucket
			const key = "__dirs__"
			if (!dirMap.has(key)) dirMap.set(key, [])
			dirMap.get(key)!.push(trimmed)
			continue
		}

		const dir = path.dirname(trimmed)
		if (dir === "." || dir === "") {
			rootFiles.push(trimmed)
		} else {
			const dirKey = dir + "/"
			if (!dirMap.has(dirKey)) dirMap.set(dirKey, [])
			dirMap.get(dirKey)!.push(path.basename(trimmed))
		}
	}

	const outputLines: string[] = []

	// Root-level files listed individually (no grouping benefit)
	for (const f of rootFiles) {
		outputLines.push(f)
	}

	// Directory entries
	const dirEntries = dirMap.get("__dirs__")
	if (dirEntries) {
		for (const d of dirEntries) outputLines.push(d)
	}

	// Grouped file entries
	for (const [dir, files] of dirMap.entries()) {
		if (dir === "__dirs__") continue

		const count = files.length
		const label = count === 1 ? "1 file" : `${count} files`

		const MAX_INLINE = 8
		if (files.length <= MAX_INLINE) {
			outputLines.push(`${dir} (${label}): ${files.join(", ")}`)
		} else {
			const shown = files.slice(0, MAX_INLINE)
			const remaining = files.length - MAX_INLINE
			outputLines.push(`${dir} (${label}): ${shown.join(", ")}, +${remaining} more`)
		}
	}

	return outputLines.join("\n") + suffix
}

/**
 * Run-length encode repeated identical lines.
 * e.g. 5 identical lines → "line content [×5]"
 */
function rleCompressLines(text: string): string {
	const lines = text.split("\n")
	const result: string[] = []
	let i = 0
	while (i < lines.length) {
		let count = 1
		while (i + count < lines.length && lines[i + count] === lines[i]) {
			count++
		}
		if (count > 3) {
			result.push(`${lines[i]} [×${count}]`)
		} else {
			for (let j = 0; j < count; j++) result.push(lines[i])
		}
		i += count
	}
	return result.join("\n")
}

/**
 * Cap search results at maxMatches, appending a summary line.
 */
function capSearchResults(text: string, maxMatches: number): string {
	const lines = text.split("\n")
	if (lines.length <= maxMatches) return text
	const kept = lines.slice(0, maxMatches)
	const omitted = lines.length - maxMatches
	kept.push(`[...${omitted} more results omitted]`)
	return kept.join("\n")
}

/**
 * Keep head and tail of text, replacing the middle with a summary.
 */
function headTailTruncate(text: string, maxChars: number): string {
	const HEAD = Math.floor(maxChars * 0.75)
	const TAIL = Math.floor(maxChars * 0.15)
	const omitted = text.length - HEAD - TAIL
	return `${text.slice(0, HEAD)}\n[...${omitted} chars truncated...]\n${text.slice(text.length - TAIL)}`
}
