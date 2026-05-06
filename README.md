<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=agi-hub.SlimCode"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
  <a href="https://x.com/roocode"><img src="https://img.shields.io/badge/roocode-000000?style=flat&logo=x&logoColor=white" alt="X"></a>
  <a href="https://youtube.com/@roocodeyt?feature=shared"><img src="https://img.shields.io/badge/YouTube-FF0000?style=flat&logo=youtube&logoColor=white" alt="YouTube"></a>
  <a href="https://discord.gg/roocode"><img src="https://img.shields.io/badge/Join%20Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Join Discord"></a>
  <a href="https://www.reddit.com/r/RooCode/"><img src="https://img.shields.io/badge/Join%20r%2FRooCode-FF4500?style=flat&logo=reddit&logoColor=white" alt="Join r/RooCode"></a>
</p>
<p align="center">
  <em>Get help fast → <a href="https://discord.gg/roocode">Join Discord</a> • Prefer async? → <a href="https://www.reddit.com/r/RooCode/">Join r/RooCode</a></em>
</p>

# Slim Code

> Your AI-Powered Dev Team, Right in Your Editor

**Slim Code** is an **optimized distribution** built on **[Roo Code](https://github.com/RooCodeInc/Roo-Code)**. It keeps the same core idea—AI-assisted development inside your editor—with a leaner footprint, targeted performance and workflow improvements, and ongoing tuning for practical daily use. For upstream features, docs, and community, see Roo Code’s official channels below.

## Base Version

Slim Code is built on **Roo Code v3.51.0** and then applies Slim Code's own optimizations and workflow tuning.

<details>
  <summary>🌐 Available languages</summary>

- [English](README.md)
- [简体中文](locales/zh-CN/README.md)
- ...
  </details>

---

## Context & prompt optimizations

Slim Code focuses on one practical goal: **send less unnecessary context while keeping answer quality and tool reliability**. In long sessions this helps:

- reduce token usage and API cost,
- speed up request/response time,
- lower "context bloat" that can hurt reasoning quality.

Most of these changes live in [`src/opt`](src/opt/) and are controlled by `OptConfig` (defaults in `DEFAULT_OPT_CONFIG`). They mainly affect what is sent to the model API, and avoid breaking tool semantics (`tool_use_id` chains, Anthropic signed thinking rules, etc.). Deeper history: [docs/slim-code-git-history.md](docs/slim-code-git-history.md).

### What Slim Code changes in the context/token pipeline

| Area                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool result compression**   | When tool results are written into the conversation, compress by tool: e.g. **list_files** groups paths by directory; **execute_command** uses run-length style compression on repeated lines and a **tighter character cap** (default 6000) than other tools (default 8000); **search_files** caps match count. Oversized text gets **head+tail** truncation. **`read_file`** avoids whitespace/content transforms that would break `apply_diff` / patch tools—only safe truncation with an explicit notice. |
| **Old `environment_details`** | User messages carry `<environment_details>` (tabs, terminals, costs, etc.). **Earlier** user turns replace that block with a small placeholder; the **last few rounds** stay full (default **3** rounds).                                                                                                                                                                                                                                                                                                    |
| **Old reasoning / thinking**  | On **Anthropic** (and Vertex), thinking blocks stay intact (API signature rules). On other providers, **older** rounds can strip plain `reasoning_content` / `reasoning_details` to stop long chats from re-sending huge reasoning traces.                                                                                                                                                                                                                                                                  |
| **Old tool blocks**           | Before the request is sent, **older** assistant/user turns: compact `tool_use` JSON (no pretty-print), shorten old `tool_result` strings (default **2000** chars for those rounds), merge text blocks / image placeholders where applicable—**without** breaking tool IDs.                                                                                                                                                                                                                                  |
| **MCP tool text**             | Optional: shorten descriptions for MCP tools that are not in heavy use (default **off**; max description length default **120**). Applied when building the tools array for the API.                                                                                                                                                                                                                                                                                                                        |
| **System prompt cache**       | `getSystemPrompt()` memoizes the built system prompt until mode, instructions, language, model, **simple reply**, MCP tool count proxy, or related inputs change—avoids rebuilding the same large string every turn.                                                                                                                                                                                                                                                                                        |
| **Request shaping**                  | Merges **consecutive user** API messages for the outgoing call only; applies **condense** / **sliding-window truncation** when context management runs (non-destructive to stored history; effective history drives what is sent).                                                                                                                                                                                                                                                                            |

### Prompts & model-facing copy

- **Shorter core prompts**: System prompt **sections** (capabilities, rules, modes, tools, etc.) and **native tool** descriptions are edited for fewer tokens than a stock Roo Code checkout.
- **Environment & support text**: `getEnvironmentDetails` and related **support** prompts are tightened so each turn’s “meta” payload stays smaller where possible.
- **Simple reply** (on by default in settings): Extra **RULES** text pushes concise assistant replies—fewer filler phrases and less narration—saving both output tokens and follow-up context.
- **Fallback hints**: If the main model is stuck, an optional **fallback** provider can inject a **short** diagnostic hint (`hint-injector`), reducing useless retries and error churn in the thread.

---

## What Can Slim Code Do For YOU?

- Generate Code from natural language descriptions and specs
- Adapt with Modes: Code, Architect, Ask, Debug, and Custom Modes
- Refactor & Debug existing code
- Write & Update documentation
- Answer Questions about your codebase
- Automate repetitive tasks
- Utilize MCP Servers

## Modes

Slim Code adapts to how you work:

- Code Mode: everyday coding, edits, and file ops
- Architect Mode: plan systems, specs, and migrations
- Ask Mode: fast answers, explanations, and docs
- Debug Mode: trace issues, add logs, isolate root causes
- Custom Modes: build specialized modes for your team or workflow

Learn more: [Using Modes](https://docs.roocode.com/basic-usage/using-modes) • [Custom Modes](https://docs.roocode.com/advanced-usage/custom-modes)

## Tutorial & Feature Videos

<div align="center">

|                                                                                                                                                                            |                                                                                                                                                                            |                                                                                                                                                                          |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <a href="https://www.youtube.com/watch?v=Mcq3r1EPZ-4"><img src="https://img.youtube.com/vi/Mcq3r1EPZ-4/maxresdefault.jpg" width="100%"></a><br><b>Installing Slim Code</b> | <a href="https://www.youtube.com/watch?v=ZBML8h5cCgo"><img src="https://img.youtube.com/vi/ZBML8h5cCgo/maxresdefault.jpg" width="100%"></a><br><b>Configuring Profiles</b> | <a href="https://www.youtube.com/watch?v=r1bpod1VWhg"><img src="https://img.youtube.com/vi/r1bpod1VWhg/maxresdefault.jpg" width="100%"></a><br><b>Codebase Indexing</b>  |
|     <a href="https://www.youtube.com/watch?v=iiAv1eKOaxk"><img src="https://img.youtube.com/vi/iiAv1eKOaxk/maxresdefault.jpg" width="100%"></a><br><b>Custom Modes</b>     |     <a href="https://www.youtube.com/watch?v=Ho30nyY332E"><img src="https://img.youtube.com/vi/Ho30nyY332E/maxresdefault.jpg" width="100%"></a><br><b>Checkpoints</b>      | <a href="https://www.youtube.com/watch?v=HmnNSasv7T8"><img src="https://img.youtube.com/vi/HmnNSasv7T8/maxresdefault.jpg" width="100%"></a><br><b>Context Management</b> |

</div>
<p align="center">
<a href="https://docs.roocode.com/tutorial-videos">More quick tutorial and feature videos...</a>
</p>

## Resources

- **[Roo Code (upstream)](https://github.com/RooCodeInc/Roo-Code):** The open-source project Slim Code is based on; use it for upstream history, comparisons, and contributions to the core codebase.
- **[Documentation](https://docs.roocode.com):** The official guide to installing, configuring, and mastering Slim Code (and shared Roo Code concepts).
- **[YouTube Channel](https://youtube.com/@roocodeyt?feature=shared):** Watch tutorials and see features in action.
- **[Discord Server](https://discord.gg/roocode):** Join the community for real-time help and discussion.
- **[Reddit Community](https://www.reddit.com/r/RooCode):** Share your experiences and see what others are building.
- **[GitHub Issues](https://github.com/RooCodeInc/Roo-Code/issues):** Report bugs and track development.
- **[Feature Requests](https://github.com/RooCodeInc/Roo-Code/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop):** Have an idea? Share it with the developers.

---

## Local Setup & Development

1. **Clone** the repo:

```sh
git clone https://github.com/RooCodeInc/Roo-Code.git
```

2. **Install dependencies**:

```sh
pnpm install
```

3. **Run the extension**:

There are several ways to run the Slim Code extension:

### Development Mode (F5)

For active development, use VSCode's built-in debugging:

Press `F5` (or go to **Run** → **Start Debugging**) in VSCode. This will open a new VSCode window with the Slim Code extension running.

- Changes to the webview will appear immediately.
- Changes to the core extension will also hot reload automatically.

### Automated VSIX Installation

To build and install the extension as a VSIX package directly into VSCode:

```sh
pnpm install:vsix [-y] [--editor=<command>]
```

This command will:

- Ask which editor command to use (code/cursor/code-insiders) - defaults to 'code'
- Uninstall any existing version of the extension.
- Build the latest VSIX package.
- Install the newly built VSIX.
- Prompt you to restart VS Code for changes to take effect.

Options:

- `-y`: Skip all confirmation prompts and use defaults
- `--editor=<command>`: Specify the editor command (e.g., `--editor=cursor` or `--editor=code-insiders`)

### Manual VSIX Installation

If you prefer to install the VSIX package manually:

1.  First, build the VSIX package:
    ```sh
    pnpm vsix
    ```
2.  A `.vsix` file will be generated in the `bin/` directory (e.g., `bin/SlimCode-<version>.vsix`).
3.  Install it manually using the VSCode CLI:
    ```sh
    code --install-extension bin/SlimCode-<version>.vsix
    ```

---

We use [changesets](https://github.com/changesets/changesets) for versioning and publishing. Check our `CHANGELOG.md` for release notes.

---

## Disclaimer

**Please note** that Slim Code, Inc does **not** make any representations or warranties regarding any code, models, or other tools provided or made available in connection with Slim Code, any associated third-party tools, or any resulting outputs. You assume **all risks** associated with the use of any such tools or outputs; such tools are provided on an **"AS IS"** and **"AS AVAILABLE"** basis. Such risks may include, without limitation, intellectual property infringement, cyber vulnerabilities or attacks, bias, inaccuracies, errors, defects, viruses, downtime, property loss or damage, and/or personal injury. You are solely responsible for your use of any such tools or outputs (including, without limitation, the legality, appropriateness, and results thereof).

---

## Contributing

We love community contributions! Get started by reading our [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[Apache 2.0 © 2025 Slim Code, Inc.](./LICENSE)

---

**Enjoy Slim Code!** Whether you keep it on a short leash or let it roam autonomously, we can’t wait to see what you build. If you have questions or feature ideas, drop by our [Reddit community](https://www.reddit.com/r/RooCode/) or [Discord](https://discord.gg/roocode). Happy coding!
