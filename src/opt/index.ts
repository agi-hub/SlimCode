/**
 * Token optimization module for Roo-Code.
 *
 * All optimizations are designed to be non-destructive:
 * - They only affect data sent to the API, not the persisted conversation history.
 * - They are gated by feature flags in OptConfig.
 * - They maintain correctness (tool_use_id references, API contract compatibility).
 */

export interface OptConfig {
	/** Compress tool result content before writing to history (opt1). Default: true */
	toolResultCompression: boolean
	/** Strip old reasoning/thinking content for non-Anthropic providers (opt2). Default: true */
	trimOldReasoning: boolean
	/** Slim MCP tool descriptions when building tools array (opt5). Default: false */
	slimMcpToolDescriptions: boolean
	/** Compact old tool blocks in conversation history before sending to API (opt7). Default: true */
	compactOldToolBlocks: boolean
	/** Strip environment_details blocks from old user messages (optA). Default: true */
	trimOldEnvDetails: boolean
	/** How many recent assistant/user round-trip pairs to keep intact for opt2, opt7, optA. Default: 3 */
	keepRecentRounds: number
	/** Maximum characters for a tool result content string (opt1 / opt7 general cap). Default: 8000 */
	maxToolResultChars: number
	/**
	 * Maximum characters for execute_command output (opt1/optE).
	 * Aligned to TERMINAL_PREVIEW_BYTES "small" (3 KB) × 2 = ~6144.
	 * Terminal preview is already truncated before reaching history; this cap
	 * prevents extremely large stdout bursts (e.g. npm install) from inflating history.
	 * Default: 6000
	 */
	maxCommandResultChars: number
	/** Maximum characters for tool result in old rounds (opt7). Default: 2000 */
	maxOldRoundResultChars: number
	/** Maximum characters for a non-core MCP tool description (opt5). Default: 120 */
	maxMcpDescriptionLength: number
}

export const DEFAULT_OPT_CONFIG: OptConfig = {
	toolResultCompression: true,
	trimOldReasoning: true,
	slimMcpToolDescriptions: false,
	compactOldToolBlocks: true,
	trimOldEnvDetails: true,
	keepRecentRounds: 3,
	maxToolResultChars: 8000,
	maxCommandResultChars: 6000,
	maxOldRoundResultChars: 2000,
	maxMcpDescriptionLength: 120,
}

export { compressToolResultContent } from "./tool-result-compressor"
export { trimReasoningHistory } from "./reasoning-history-trimmer"
export { slimMcpToolDefinitions } from "./tool-description-slim"
export { compactOldToolBlocks } from "./history-formatter"
export { trimOldEnvironmentDetails } from "./env-details-trimmer"
