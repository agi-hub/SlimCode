<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.SlimCode"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
  <a href="https://x.com/roocode"><img src="https://img.shields.io/badge/roocode-000000?style=flat&logo=x&logoColor=white" alt="X"></a>
  <a href="https://youtube.com/@roocodeyt?feature=shared"><img src="https://img.shields.io/badge/YouTube-FF0000?style=flat&logo=youtube&logoColor=white" alt="YouTube"></a>
  <a href="https://discord.gg/roocode"><img src="https://img.shields.io/badge/Join%20Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Join Discord"></a>
  <a href="https://www.reddit.com/r/RooCode/"><img src="https://img.shields.io/badge/Join%20r%2FRooCode-FF4500?style=flat&logo=reddit&logoColor=white" alt="Join r/RooCode"></a>
</p>
<p align="center">
  <em>快速获取帮助 → <a href="https://discord.gg/roocode">加入 Discord</a> • 偏好异步？→ <a href="https://www.reddit.com/r/RooCode/">加入 r/RooCode</a></em>
</p>

# Slim Code

> 你的 AI 驱动开发团队，就在你的编辑器里

**Slim Code** 是基于 **[Roo Code](https://github.com/RooCodeInc/Roo-Code)** 的**优化发行版**。它延续相同核心理念——在编辑器内进行 AI 辅助开发——并侧重更轻量的体积、针对性的性能与工作流改进，以及面向日常使用的持续调优。上游功能、文档与社区请参阅下文中的 Roo Code 官方渠道。

## v3.51.0 新增内容

- 已添加对 OpenAI GPT-5.4 和 GPT-5.3 Chat Latest 的支持，让你可以在 Slim Code 中使用 OpenAI 最新的聊天模型。
- 现在可以将 skills 公开为 slash 命令，并支持 fallback execution，让可复用工作流触发得更快。

<details>
  <summary>🌐 可用语言</summary>

- [English](../../README.md)
- [Català](../ca/README.md)
- [Deutsch](../de/README.md)
- [Español](../es/README.md)
- [Français](../fr/README.md)
- [हिंदी](../hi/README.md)
- [Bahasa Indonesia](../id/README.md)
- [Italiano](../it/README.md)
- [日本語](../ja/README.md)
- [한국어](../ko/README.md)
- [Nederlands](../nl/README.md)
- [Polski](../pl/README.md)
- [Português (BR)](../pt-BR/README.md)
- [Русский](../ru/README.md)
- [Türkçe](../tr/README.md)
- [Tiếng Việt](../vi/README.md)
- [简体中文](../zh-CN/README.md)
- [繁體中文](../zh-TW/README.md)
- ...
    </details>

---

## 上下文与提示词优化

> 说明：无法访问你与 AI 的**历史聊天会话**；下列条目来自本仓库源码（`src/opt/`、`Task.ts`、`presentAssistantMessage.ts`、系统提示与规则等），便于对照实现。

在 Roo Code 之上，Slim Code 系统性做了**提示词瘦身**与**发往模型前的上下文优化**。[`src/opt`](../../src/opt/) 中的约定是：优先只改**发往 API 的内存数据**（磁盘上的持久化对话另有策略）、行为由 **`OptConfig` / `DEFAULT_OPT_CONFIG`** 约束、并保证 **工具调用链与厂商协议**（如 `tool_use_id`、Anthropic 签名 thinking）不被破坏。更完整的变更脉络见 [docs/slim-code-git-history.md](../../docs/slim-code-git-history.md)。

### 上下文与 Token 管线（默认值见 `DEFAULT_OPT_CONFIG`）

| 项目                         | 作用                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **工具结果压缩（opt1）**     | 工具结果写入对话前按工具类型压缩：**list_files** 按目录归并路径；**execute_command** 对重复行做游程类压缩，并使用**更严的长度上限**（默认 6000 字符，其它工具默认 8000）；**search_files** 限制匹配条数；过长文本做**头尾截断**。**read_file** 不做会破坏空白/正文的改写，以免影响 `apply_diff` 等需逐字匹配的编辑；仅做安全范围内的截断并明确提示。 |
| **旧轮环境详情（optA）**     | 用户消息中的 `<environment_details>` 在**较早轮次**被替换为短占位；**最近约 3 轮**（与 opt2 / opt7 共用 `keepRecentRounds`）保持完整，避免模型失去当前环境感知。                                                                                                                                                                                     |
| **旧轮推理内容（opt2）**     | **Anthropic / Vertex** 的 thinking 块保持不动（签名校验）。其它提供商可对**较早轮次**去掉冗长的 `reasoning_content` / `reasoning_details`，减轻长对话里推理文本反复堆叠。                                                                                                                                                                            |
| **旧轮工具块紧凑化（opt7）** | 在**较早轮次**将 `tool_use` 的 JSON 参数紧凑序列化、缩短旧 `tool_result`（旧轮默认约 **2000** 字符）、必要时合并文本块等；**不破坏**工具 ID 引用。                                                                                                                                                                                                   |
| **MCP 工具描述（opt5）**     | 可选：对使用较少的 MCP 工具缩短描述（默认**关闭**；单描述默认上限约 **120** 字符）。在组装发给 API 的 `tools` 数组时生效。                                                                                                                                                                                                                           |
| **系统提示缓存（optB）**     | `getSystemPrompt()` 在模式、说明、语言、模型、**简洁回复**、MCP 工具数量代理等未变时复用已构建的系统提示，减少每轮重复拼接大段固定文案。                                                                                                                                                                                                             |
| **请求拼装**                 | 仅对 API **合并连续的用户消息**；在上下文管理运行时配合**摘要（condense）**与**滑动窗口截断**等机制（对磁盘历史多为非破坏性标记，由「有效历史」决定实际上送内容）。                                                                                                                                                                                  |

### 提示词与模型可见文案

- **核心提示词**：系统提示各 **section** 与各 **原生工具** 的说明相对上游更短、更直接。
- **环境与支持类文案**：`getEnvironmentDetails`、各类 **support** 提示等已收紧，降低每轮附带的元信息体积。
- **简洁回复（默认开启）**：在 **RULES** 中注入「少废话、少客套、直接行动」等约束，减少模型输出长度与后续上下文占用。
- **备用提示（hint）**：主模型卡住时，可选用 **fallback** 模型生成**短**诊断提示（`hint-injector`），减少无效重试与错误信息在对话里堆积。

---

## Slim Code 能为您做什么？

- 从自然语言描述生成代码
- 使用模式进行调整：代码、架构师、提问、调试和自定义模式
- 重构和调试现有代码
- 编写和更新文档
- 回答关于您的代码库的问题
- 自动化重复性任务
- 使用 MCP 服务器

## 模式

Slim Code 适应您的工作方式，而不是相反：

- 代码模式：日常编码、编辑和文件操作
- 架构师模式：规划系统、规范和迁移
- 提问模式：快速回答、解释和文档
- 调试模式：跟踪问题、添加日志、隔离根本原因
- 自定义模式：为您的团队或工作流程构建专门的模式

了解更多：[使用模式](https://docs.roocode.com/basic-usage/using-modes) • [自定义模式](https://docs.roocode.com/advanced-usage/custom-modes)

## 教程和功能视频

<div align="center">

|                                                                                                                                                                      |                                                                                                                                                                    |                                                                                                                                                                  |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <a href="https://www.youtube.com/watch?v=Mcq3r1EPZ-4"><img src="https://img.youtube.com/vi/Mcq3r1EPZ-4/maxresdefault.jpg" width="100%"></a><br><b>安装 Slim Code</b> | <a href="https://www.youtube.com/watch?v=ZBML8h5cCgo"><img src="https://img.youtube.com/vi/ZBML8h5cCgo/maxresdefault.jpg" width="100%"></a><br><b>配置个人资料</b> | <a href="https://www.youtube.com/watch?v=r1bpod1VWhg"><img src="https://img.youtube.com/vi/r1bpod1VWhg/maxresdefault.jpg" width="100%"></a><br><b>代码库索引</b> |
|   <a href="https://www.youtube.com/watch?v=iiAv1eKOaxk"><img src="https://img.youtube.com/vi/iiAv1eKOaxk/maxresdefault.jpg" width="100%"></a><br><b>自定义模式</b>   |    <a href="https://www.youtube.com/watch?v=Ho30nyY332E"><img src="https://img.youtube.com/vi/Ho30nyY332E/maxresdefault.jpg" width="100%"></a><br><b>检查点</b>    | <a href="https://www.youtube.com/watch?v=HmnNSasv7T8"><img src="https://img.youtube.com/vi/HmnNSasv7T8/maxresdefault.jpg" width="100%"></a><br><b>上下文管理</b> |

</div>
<p align="center">
<a href="https://docs.roocode.com/tutorial-videos">更多快速教程和功能视频...</a>
</p>

## 资源

- **[Roo Code（上游）](https://github.com/RooCodeInc/Roo-Code)：** Slim Code 所基于的开源项目；可用于上游历史、版本对比以及对核心代码库的贡献。
- **[文档](https://docs.roocode.com):** 安装、配置和掌握 Slim Code 的官方指南（以及与 Roo Code 相通的概念）。
- **[YouTube 频道](https://youtube.com/@roocodeyt?feature=shared):** 观看教程和功能演示。
- **[Discord 服务器](https://discord.gg/roocode):** 加入社区以获得实时帮助和讨论。
- **[Reddit 社区](https://www.reddit.com/r/RooCode):** 分享您的经验，看看别人在构建什么。
- **[GitHub 问题](https://github.com/RooCodeInc/Roo-Code/issues):** 报告错误并跟踪开发。
- **[功能请求](https://github.com/RooCodeInc/Roo-Code/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop):** 有想法吗？与开发人员分享。

---

## 本地设置与开发

1. **克隆**仓库：

```sh
git clone https://github.com/RooCodeInc/Roo-Code.git
```

2. **安装依赖项**:

```sh
pnpm install
```

3. **运行扩展程序**:

有几种方法可以运行 Slim Code 扩展程序：

### 开发模式（F5）

对于积极开发，请使用 VSCode 的内置调试功能：

在 VSCode 中按 `F5`（或转到 **Run** → **Start Debugging**）。这将在运行 Slim Code 扩展程序的新 VSCode 窗口中打开。

- 对 webview 的更改将立即显示。
- 对核心扩展程序的更改也会自动热重载。

### 自动化 VSIX 安装

要将扩展程序构建为 VSIX 包并直接安装到 VSCode 中：

```sh
pnpm install:vsix [-y] [--editor=<command>]
```

此命令将：

- 询问要使用的编辑器命令（code/cursor/code-insiders） - 默认为“code”
- 卸载任何现有版本的扩展程序。
- 构建最新的 VSIX 包。
- 安装新构建的 VSIX。
- 提示您重新启动 VS Code 以使更改生效。

选项：

- `-y`: 跳过所有确认提示并使用默认值
- `--editor=<command>`: 指定编辑器命令（例如，`--editor=cursor` 或 `--editor=code-insiders`）

### 手动 VSIX 安装

如果您希望手动安装 VSIX 包：

1.  首先，构建 VSIX 包：
    ```sh
    pnpm vsix
    ```
2.  将在 `bin/` 目录中生成一个 `.vsix` 文件（例如，`bin/SlimCode-<version>.vsix`）。
3.  使用 VSCode CLI 手动安装
    ```sh
    code --install-extension bin/SlimCode-<version>.vsix
    ```

---

我们使用 [changesets](https://github.com/changesets/changesets) 进行版本控制和发布。有关发行说明，请查看我们的 `CHANGELOG.md`。

---

## 免责声明

**请注意**，Slim Code, Inc. **不**对与 Slim Code 相关的任何代码、模型或其他工具、任何相关的第三方工具或任何由此产生的输出作出任何陈述或保证。您承担使用任何此类工具或输出的**所有风险**；此类工具均按**“原样”**和**“可用”**的基础提供。此类风险可能包括但不限于知识产权侵权、网络漏洞或攻击、偏见、不准确、错误、缺陷、病毒、停机、财产损失或损害和/或人身伤害。您对自己使用任何此类工具或输出负全部责任（包括但不限于其合法性、适当性和结果）。

---

## 贡献

我们欢迎社区贡献！请阅读我们的 [CONTRIBUTING.md](CONTRIBUTING.md) 开始。

---

## 许可证

[Apache 2.0 © 2025 Slim Code, Inc.](../../LICENSE)

---

**享受 Slim Code！** 无论您是让它保持短绳还是让它自主漫游，我们都迫不及待地想看看您会构建什么。如果您有问题或功能想法，请访问我们的 [Reddit 社区](https://www.reddit.com/r/RooCode/)或 [Discord](https://discord.gg/roocode)。编码愉快！
