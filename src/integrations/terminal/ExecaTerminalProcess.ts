import { execa, ExecaError } from "execa"
import psTree from "ps-tree"
import process from "process"
import { spawn, type ChildProcessWithoutNullStreams } from "child_process"

import type { RooTerminal } from "./types"
import { BaseTerminal } from "./BaseTerminal"
import { BaseTerminalProcess } from "./BaseTerminalProcess"

export class ExecaTerminalProcess extends BaseTerminalProcess {
	private terminalRef: WeakRef<RooTerminal>
	private aborted = false
	private pid?: number
	private subprocess?: ReturnType<typeof execa>
	private legacySubprocess?: ChildProcessWithoutNullStreams
	private pidUpdatePromise?: Promise<void>
	private readonly utf8Decoder = new TextDecoder("utf-8")
	private readonly gbkDecoder =
		process.platform === "win32"
			? (() => {
					try {
						return new TextDecoder("gbk")
					} catch {
						return undefined
					}
				})()
			: undefined

	constructor(terminal: RooTerminal) {
		super()

		this.terminalRef = new WeakRef(terminal)

		this.once("completed", () => {
			this.terminal.busy = false
		})
	}

	public get terminal(): RooTerminal {
		const terminal = this.terminalRef.deref()

		if (!terminal) {
			throw new Error("Unable to dereference terminal")
		}

		return terminal
	}

	public override async run(command: string) {
		this.command = command

		try {
			this.isHot = true

			// On Windows, LANG/LC_ALL are Unix-only and ignored by cmd/PowerShell.
			// Switch the console code page to UTF-8 (65001) so that CJK characters
			// and other non-ASCII output are not garbled.
			let commandToRun = command
			const utf8Env: Record<string, string> =
				process.platform === "win32"
					? {
							PYTHONUTF8: "1",
							PYTHONIOENCODING: "utf-8",
						}
					: {
							LANG: "en_US.UTF-8",
							LC_ALL: "en_US.UTF-8",
						}

			if (process.platform === "win32") {
				const shellPath = (BaseTerminal.getExecaShellPath() ?? "").toLowerCase()
				const isPowerShell =
					shellPath.includes("powershell") ||
					shellPath.includes("pwsh") ||
					// When no explicit shell is set (shell: true → cmd.exe on Windows),
					// also check the COMSPEC env var and common PowerShell defaults.
					(!shellPath && (process.env.COMSPEC ?? "").toLowerCase().includes("powershell"))

				if (isPowerShell) {
					// Force PowerShell to use UTF-8 for both input and output.
					commandToRun = `$OutputEncoding=[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ${command}`
				} else {
					// For cmd.exe: switch the code page to UTF-8 (65001) silently,
					// then run the actual command. The ">nul" suppresses the
					// "Active code page: 65001" message so it does not pollute output.
					commandToRun = `chcp 65001>nul && ${command}`
				}
			}

			if (typeof (process as NodeJS.Process & { addAbortListener?: unknown }).addAbortListener !== "function") {
				console.warn(
					"[ExecaTerminalProcess#run] Node runtime lacks process.addAbortListener, falling back to child_process",
				)
				await this.runWithLegacySpawn(commandToRun, utf8Env)
			} else {
				this.subprocess = execa({
					shell: BaseTerminal.getExecaShellPath() || true,
					cwd: this.terminal.getCurrentWorkingDirectory(),
					all: true,
					// Ignore stdin to ensure non-interactive mode and prevent hanging
					stdin: "ignore",
					env: {
						...process.env,
						...utf8Env,
					},
				})`${commandToRun}`

				this.pid = this.subprocess.pid

				// When using shell: true, the PID is for the shell, not the actual command
				// Find the actual command PID after a small delay
				if (this.pid) {
					this.pidUpdatePromise = new Promise<void>((resolve) => {
						setTimeout(() => {
							psTree(this.pid!, (err, children) => {
								if (!err && children.length > 0) {
									// Update PID to the first child (the actual command)
									const actualPid = parseInt(children[0].PID)
									if (!isNaN(actualPid)) {
										this.pid = actualPid
									}
								}
								resolve()
							})
						}, 100)
					})
				}

				const rawStream = this.subprocess.iterable({ from: "all", preserveNewlines: true })

				// Wrap the stream to ensure all chunks are strings (execa can return Uint8Array)
				const stream = (async function* () {
					for await (const chunk of rawStream) {
						yield typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)
					}
				})()

				this.terminal.setActiveStream(stream, this.pid)

				for await (const line of stream) {
					if (this.aborted) {
						break
					}

					this.fullOutput += line

					const now = Date.now()

					if (this.isListening && (now - this.lastEmitTime_ms > 500 || this.lastEmitTime_ms === 0)) {
						this.emitRemainingBufferIfListening()
						this.lastEmitTime_ms = now
					}

					this.startHotTimer(line)
				}

				if (this.aborted) {
					let timeoutId: NodeJS.Timeout | undefined

					const kill = new Promise<void>((resolve) => {
						console.log(`[ExecaTerminalProcess#run] SIGKILL -> ${this.pid}`)

						timeoutId = setTimeout(() => {
							try {
								this.subprocess?.kill("SIGKILL")
							} catch (e) {}

							resolve()
						}, 5_000)
					})

					try {
						await Promise.race([this.subprocess, kill])
					} catch (error) {
						console.log(
							`[ExecaTerminalProcess#run] subprocess termination error: ${error instanceof Error ? error.message : String(error)}`,
						)
					}

					if (timeoutId) {
						clearTimeout(timeoutId)
					}
				}

				this.emit("shell_execution_complete", { exitCode: 0 })
			}
		} catch (error) {
			if (error instanceof ExecaError) {
				console.error(`[ExecaTerminalProcess#run] shell execution error: ${error.message}`)
				this.emit("shell_execution_complete", { exitCode: error.exitCode ?? 0, signalName: error.signal })
			} else {
				console.error(
					`[ExecaTerminalProcess#run] shell execution error: ${error instanceof Error ? error.message : String(error)}`,
				)

				this.emit("shell_execution_complete", { exitCode: 1 })
			}
			this.subprocess = undefined
		}

		this.terminal.setActiveStream(undefined)
		this.emitRemainingBufferIfListening()
		this.stopHotTimer()
		this.emit("completed", this.fullOutput)
		this.emit("continue")
		this.subprocess = undefined
	}

	public override continue() {
		this.isListening = false
		this.removeAllListeners("line")
		this.emit("continue")
	}

	public override abort() {
		this.aborted = true

		// Function to perform the kill operations
		const performKill = () => {
			if (this.legacySubprocess) {
				try {
					this.legacySubprocess.kill("SIGKILL")
				} catch (e) {
					console.warn(
						`[ExecaTerminalProcess#abort] Failed to kill legacy subprocess: ${e instanceof Error ? e.message : String(e)}`,
					)
				}
			}

			// Try to kill using the subprocess object
			if (this.subprocess) {
				try {
					this.subprocess.kill("SIGKILL")
				} catch (e) {
					console.warn(
						`[ExecaTerminalProcess#abort] Failed to kill subprocess: ${e instanceof Error ? e.message : String(e)}`,
					)
				}
			}

			// Kill the stored PID (which should be the actual command after our update)
			if (this.pid) {
				try {
					process.kill(this.pid, "SIGKILL")
				} catch (e) {
					console.warn(
						`[ExecaTerminalProcess#abort] Failed to kill process ${this.pid}: ${e instanceof Error ? e.message : String(e)}`,
					)
				}
			}
		}

		// If PID update is in progress, wait for it before killing
		if (this.pidUpdatePromise) {
			this.pidUpdatePromise.then(performKill).catch(() => performKill())
		} else {
			performKill()
		}

		// Continue with the rest of the abort logic
		if (this.pid) {
			// Also check for any child processes
			psTree(this.pid, async (err, children) => {
				if (!err) {
					const pids = children.map((p) => parseInt(p.PID))

					for (const pid of pids) {
						try {
							process.kill(pid, "SIGKILL")
						} catch (e) {
							console.warn(
								`[ExecaTerminalProcess#abort] Failed to send SIGKILL to child PID ${pid}: ${e instanceof Error ? e.message : String(e)}`,
							)
						}
					}
				} else {
					console.error(
						`[ExecaTerminalProcess#abort] Failed to get process tree for PID ${this.pid}: ${err.message}`,
					)
				}
			})
		}
	}

	public override hasUnretrievedOutput() {
		return this.lastRetrievedIndex < this.fullOutput.length
	}

	public override getUnretrievedOutput() {
		let output = this.fullOutput.slice(this.lastRetrievedIndex)
		let index = output.lastIndexOf("\n")

		if (index === -1) {
			return ""
		}

		index++
		this.lastRetrievedIndex += index

		// console.log(
		// 	`[ExecaTerminalProcess#getUnretrievedOutput] fullOutput.length=${this.fullOutput.length} lastRetrievedIndex=${this.lastRetrievedIndex}`,
		// 	output.slice(0, index),
		// )

		return output.slice(0, index)
	}

	private emitRemainingBufferIfListening() {
		if (!this.isListening) {
			return
		}

		const output = this.getUnretrievedOutput()

		if (output !== "") {
			this.emit("line", output)
		}
	}

	private async runWithLegacySpawn(commandToRun: string, utf8Env: Record<string, string>): Promise<void> {
		const shell = BaseTerminal.getExecaShellPath() || true

		await new Promise<void>((resolve) => {
			this.legacySubprocess = spawn(commandToRun, {
				shell,
				cwd: this.terminal.getCurrentWorkingDirectory(),
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					...utf8Env,
				},
			})

			this.pid = this.legacySubprocess.pid
			this.terminal.setActiveStream(undefined, this.pid)

			const onData = (chunk: string | Buffer) => {
				if (this.aborted) {
					return
				}

				const text = typeof chunk === "string" ? chunk : this.decodeLegacyChunk(chunk)
				this.fullOutput += text

				const now = Date.now()
				if (this.isListening && (now - this.lastEmitTime_ms > 500 || this.lastEmitTime_ms === 0)) {
					this.emitRemainingBufferIfListening()
					this.lastEmitTime_ms = now
				}

				this.startHotTimer(text)
			}

			this.legacySubprocess.stdout.on("data", onData)
			this.legacySubprocess.stderr.on("data", onData)

			this.legacySubprocess.once("error", (error) => {
				console.error(`[ExecaTerminalProcess#runWithLegacySpawn] shell execution error: ${error.message}`)
				this.emit("shell_execution_complete", { exitCode: 1 })
				this.legacySubprocess = undefined
				resolve()
			})

			this.legacySubprocess.once("close", (code, signal) => {
				this.emit("shell_execution_complete", { exitCode: code ?? 0, signalName: signal ?? undefined })
				this.legacySubprocess = undefined
				resolve()
			})
		})
	}

	private decodeLegacyChunk(chunk: Buffer): string {
		const utf8 = this.utf8Decoder.decode(chunk, { stream: true })

		// Old Windows shells may still emit GBK/ACP despite UTF-8 setup.
		// If UTF-8 decoding looks corrupted, prefer GBK when available.
		if (process.platform === "win32" && this.gbkDecoder && this.looksCorrupted(utf8)) {
			return this.gbkDecoder.decode(chunk, { stream: true })
		}

		return utf8
	}

	private looksCorrupted(text: string): boolean {
		if (!text) {
			return false
		}

		const replacementCharMatches = text.match(/\uFFFD/g)
		if (!replacementCharMatches) {
			return false
		}

		// Heuristic: treat as corrupted when replacement chars are frequent.
		return replacementCharMatches.length >= 2 || replacementCharMatches.length / text.length > 0.05
	}
}
