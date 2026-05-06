# 本仓库 Git 历史与核心修改摘要

本文档根据本仓库自 **首次提交（建库）以来** 的 `git log` 整理，侧重**与上下文 / Token 相关的优化**，并单独说明其它功能性改动。**品牌、README、多语言文案中的名称替换**不展开列举，仅在与功能耦合时提及。

---

## 方法与范围

- **提交数量**：截至文档编写时，主线共 **8** 个提交（含首次全量导入）。
- **信息来源**：`git log --reverse --stat`、关键路径 `src/opt/`、`src/core/task/Task.ts`、系统提示与工具描述相关源码。
- **局限**：首次提交 `451288d` 为 **Roo Code 上游整树导入**（数千文件），其功能属上游而非本 fork 独有；下文「后续提交」才是本仓库在导入基础上的增量。

---

## 提交时间线（建库后）

| 顺序 | Hash（短） | 说明                                                                     |
| ---- | ---------- | ------------------------------------------------------------------------ |
| 1    | `451288d`  | 建库：全量导入上游 + 删减部分语言资源等（见 stat 中 webview 等大量文件） |
| 2    | `6e42fbe`  | **缩短系统提示与工具 Prompt**（`shorten prompts`）                       |
| 3    | `ee612e3`  | 增加扩展 `package.nls` 文案文件                                          |
| 4    | `4894dc6`  | **多项杂项优化**（配置、欢迎页、ContextProxy、类型与设置 UI 等）         |
| 5    | `4de5e63`  | **上下文优化（一）**：引入 `src/opt` 核心能力                            |
| 6    | `1948af1`  | **上下文优化（二）**：环境块、condense、原生工具描述等                   |
| 7    | `e4be3ad`  | **上下文优化（三）**：环境详情采集重构、hint 注入、设置与 OpenAI 推理等  |
| 8    | `8001f85`  | **短回复与旧版 VS Code 兼容**、终端流式 polyfill、ContextProxy 扩展等    |

---

## 一、上下文与 Token 优化（重点）

本 fork 在 `src/opt/` 中集中实现 **「仅影响发往 API 的内存副本、不改磁盘持久化对话」** 的策略，并在 `Task` 请求模型前的消息管线上串联应用。`OptConfig` / `DEFAULT_OPT_CONFIG`（见 `src/opt/index.ts`）定义了默认开关与阈值。

### 1. 工具结果压缩（`tool-result-compressor.ts`）

- **写入历史前**按工具名压缩 `tool_result` 内容，减轻单轮与后续轮次的体积。
- 策略包括：`list_files` 按目录归并路径、`execute_command` 对重复行做游程式压缩、`search_files` 限制匹配条数、通用 **头尾截断** 等。
- **刻意不对 `read_file` 做会破坏空白/正文的变换**，避免影响 `apply_diff` / `write_to_file` 等对原文逐字匹配的工具（仅允许安全范围内的通用截断并明确告知模型已截断）。

### 2. 历史中的旧轮次压缩（`history-formatter.ts` — `compactOldToolBlocks`）

- 对 **早于最近 N 轮**（默认与 `keepRecentRounds` 对齐）的消息：
    - `tool_use` 的 `input` 用紧凑 JSON（去掉美化缩进）序列化；
    - `tool_result` 文本截断到配置上限；数组形式的多块文本可合并，图片块替换为占位说明。
- **保留 `tool_use_id` 引用链**，保证 API 侧工具调用契约仍然成立。

### 3. 非 Anthropic 提供商的旧轮次推理内容裁剪（`reasoning-history-trimmer.ts`）

- **Anthropic / Vertex**：保留带签名的 thinking 块，不修改（API 校验签名）。
- **其它提供商**：对较早轮次中的 `reasoning_content` / `reasoning_details` 等做裁剪，减少长对话中重复堆叠的推理文本；最近若干轮保持完整。

### 4. 旧用户消息中的环境详情剥离（`env-details-trimmer.ts`）

- 用户消息中常带有 `<environment_details>...</environment_details>`（时间、打开文件、终端、成本、模式等）。
- 长对话里 **仅最新若干轮需要完整环境块**；更早轮次替换为紧凑占位，避免同一段环境信息在每次请求中被反复送入模型。

### 5. MCP 工具描述瘦身（`tool-description-slim.ts`）

- 可选地对非核心 MCP 工具描述做长度限制（默认关闭或按配置），降低 `tools` 数组的 Token 占用。

### 6. 在 `Task` 中的集成顺序（概念）

管线中包含类似 **optA（旧环境块）→ opt2（旧推理）→ opt5（MCP 描述）→ opt7（旧轮工具块紧凑）** 等步骤（具体以 `Task.ts` 中注释与调用为准），且存在 **系统提示缓存（optB）** 等减少重复构建的开销。

### 7. 与「提示词体积」相关的改动（非 opt 模块但强相关）

- **`6e42fbe`（shorten prompts）**：系统性缩短 `src/core/prompts/sections/*`、各 **native 工具** 的说明文案，并更新快照测试；直接降低系统提示与工具 schema 的 Token。
- **`1948af1` / `e4be3ad`**：缩短部分 **codebase_search / list_files / search_files** 等工具描述；精简 `support-prompt`；`getEnvironmentDetails` 重构使输出更可控；condense 路径与工具使用摘要相关逻辑调整。
- **`e4be3ad`**：增加 **fallback 模型提示注入**（`hint-injector.ts`），在主模型卡住时用另一路模型生成短提示，间接减少无效重试与冗长失败上下文。

---

## 二、其它核心修改（除名称变更）

### 首次导入与资源裁剪（`451288d`）

- 以 Roo Code 为基线的 **完整 monorepo**（扩展、webview、CLI、evals、网站等）作为起点。
- 提交说明为「remove some languages」：与删减多语言或界面资源相关（具体以该提交的 diff 为准）。

### 扩展与设置（`4894dc6` 等）

- **ContextProxy / ClineProvider**：状态与消息处理调整，与后续上下文策略配合。
- **欢迎页（WelcomeViewProvider）** 等 UI 简化或改版。
- **自动批准（auto-approval）**、**类型定义**（含云与提供商相关）、**设置页**（API、组织过滤等）增量。

### 短回复与运行环境（`8001f85`）

- **短回复（short reply）** 相关设置与逻辑（含 webview 设置项）。
- **旧版 VS Code 兼容**：扩展激活、`esbuild`、**终端集成**与 **`nodeStreamHighWaterMark` polyfill** 等，改善在较低版本或特定环境下的流式输出行为。
- **ContextProxy** 能力扩展（如与短回复或展示相关的状态）。

### 仓库体积与维护（`e4be3ad` 中大量删除）

- 移除体量很大的 **`.roo/rules-*`、部分翻译规则** 等仓库内辅助 XML/Markdown，减小克隆与索引负担（与运行时扩展功能无直接对应关系）。

---

## 三、如何自行核对

```bash
git log --oneline --reverse
git show <commit> --stat
git log -p -- src/opt/
```

若需将某次优化与具体 issue 对齐，可在未来为相关提交补充 `git note` 或在 CHANGELOG 中引用本文档章节。

---

## 四、文档维护

- **生成方式**：根据当前仓库 Git 历史整理；若之后 `main` 分支增加提交，请同步更新「提交时间线」与对应章节。
- **非目标**：本文不替代上游 Roo Code 的发行说明；首次提交之前的上游历史请参阅 [Roo Code 上游仓库](https://github.com/RooCodeInc/Roo-Code)。
