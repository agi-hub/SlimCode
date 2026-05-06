import * as fs from "fs/promises"
import * as path from "path"

type LlmCallLogEntry = {
	timestamp: string
	taskId: string
	provider: string
	modelId: string
	payload: {
		systemPrompt: string
		messages: unknown
		metadata: unknown
	}
}

type LlmCallDeltaLogEntry = Omit<LlmCallLogEntry, "payload"> & {
	fullMessageCount: number
	newMessageCount: number
	isSnapshotReset: boolean
	payload: {
		systemPrompt: string
		messages: unknown
		metadata: unknown
	}
}

/** Set to true to append each API request payload to `llm_calls_*.log` under the task cwd. */
const LLM_CALL_LOGGING_ENABLED = false

const runTimestamp = formatTimestamp(new Date())
let logFilePath: string | undefined
let writeSequence = Promise.resolve()
const lastLoggedMessageCountByTask = new Map<string, number>()

function formatTimestamp(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0")
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function getReplacer() {
	const seen = new WeakSet<object>()
	return (_key: string, value: unknown) => {
		if (typeof value === "bigint") {
			return value.toString()
		}
		if (typeof value === "function") {
			return `[Function ${value.name || "anonymous"}]`
		}
		if (typeof value === "symbol") {
			return value.toString()
		}
		if (value && typeof value === "object") {
			if (seen.has(value as object)) {
				return "[Circular]"
			}
			seen.add(value as object)
		}
		return value
	}
}

async function ensureLogFile(baseDir: string): Promise<string> {
	if (logFilePath) {
		return logFilePath
	}
	const fileName = `llm_calls_${runTimestamp}.log`
	const resolved = path.join(baseDir, fileName)
	await fs.mkdir(path.dirname(resolved), { recursive: true })
	logFilePath = resolved
	return resolved
}

export async function logLlmCall(baseDir: string, entry: LlmCallLogEntry): Promise<void> {
	if (!LLM_CALL_LOGGING_ENABLED) {
		return
	}
	writeSequence = writeSequence.then(async () => {
		const filePath = await ensureLogFile(baseDir)
		const allMessages = Array.isArray(entry.payload.messages) ? entry.payload.messages : []
		const fullMessageCount = allMessages.length
		const previousCount = lastLoggedMessageCountByTask.get(entry.taskId) ?? 0
		const isSnapshotReset = fullMessageCount < previousCount
		const startIndex = isSnapshotReset ? 0 : previousCount
		const incrementalMessages = allMessages.slice(startIndex)

		const deltaEntry: LlmCallDeltaLogEntry = {
			...entry,
			fullMessageCount,
			newMessageCount: incrementalMessages.length,
			isSnapshotReset,
			payload: {
				...entry.payload,
				messages: incrementalMessages,
			},
		}

		lastLoggedMessageCountByTask.set(entry.taskId, fullMessageCount)

		const serialized = JSON.stringify(deltaEntry, getReplacer(), 2)
		const content = `${serialized}\n\n`
		await fs.appendFile(filePath, content, "utf8")
	})
	return writeSequence
}

export function getCurrentLlmCallLogFilePath(): string | undefined {
	return logFilePath
}
