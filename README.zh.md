<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.svg">
    <img src="docs/images/logo.svg" alt="DeepSeek Bot" width="260">
  </picture>
</p>

# DeepSeek Bot

[English](README.md) | 中文

## MyAgent 伙伴分支

本项目基于 [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)，将伙伴入口嵌入原版 DSH。保留 DSH 侧栏、工作区、新会话、插件、账号和全局设置。点击 **🐳 大肥鱼** 进入主 Bot 的持续对话，右侧显示可收起的详情面板；其他 Bot 和群聊通过对话页内的选择器进入，Bot 设置通过 **管理团队** 打开。普通会话使用 DSH 原生聊天界面。

**管理团队** 左侧的 **伙伴** 按钮打开可搜索的头像面板，分组显示 Bot 和群聊，复用上游角色形象和工作状态。打开已归档的 Bot 时，会先恢复它的当前对话，避免发消息或修改权限时跳回首页。历史分段仍保留归档；恢复期间切换到其他页面，会取消待完成的跳转。

工作区列表仅显示普通会话。Bot 私聊、群聊、成员后台工作会话及其历史分段，按归属 ID 从列表、数量统计和搜索结果中排除。助手工作区没有可见的普通会话时，整个空分组也会隐藏；其他普通空工作区继续显示。记录和实际工作区归属均保留。实现通过公开插槽替换工作区浏览区域，其余侧栏仍由 DSH 提供；伙伴选择器继续保留在对话页顶部。详见[列表设计与兼容范围](docs/plans/2026-10-22-ordinary-workspace-browser.md)。

Bot 运行、记忆、上下文管理、委派和群聊复用上游。本次增加伙伴导航及界面作用范围控制，没有另外实现记忆引擎或通信渠道。新团队的主 Bot 默认叫大肥鱼，已有团队保留原名称和数据。默认关闭插件更新检查，安装本分支不会覆盖 DSH 的全局搜索服务设置。

安装本分支：在 `ds-bot/` 中依次运行 `npm ci`、`npm run build`、`npm pack`，然后在 DSH **插件** 页安装生成的 `ds-bot-0.2.0-myagent.5.tgz`，重启 DSH。包名仍为 `ds-bot`，用于替换原插件，不会另建一套团队。下文的 npm 包及上游下载仍然安装上游界面。本分支尚未发布 npm 版本或桌面安装程序。

QQ 接入可使用发布版 `@xmanrui/dsh-im@5.4.0` 的现有 Bot 绑定功能，无需修改本分支。隔离模拟模型环境中的桥接与界面检查已通过；真实 QQ 账号验收单独记录。详见[渠道设置、验证范围与复现方式](docs/plans/2026-10-22-im-channel-validation.md)。

详见[设计与验证说明](docs/plans/2026-10-22-embedded-companion.md)。下文保留上游功能及发行方式说明，截图展示的是上游界面。

![版本](https://img.shields.io/badge/版本-v0.2_预览-blue) ![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.2-4D6BFE) ![许可](https://img.shields.io/badge/许可-Apache_2.0-green)

DeepSeek Bot（简称 DS Bot）是一个基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（简称 dsh）的 bot 插件，插件将 dsh 改造为 bot 形式。你可以与自己创建的 bot 交流、工作。

![和 Chief 说一句话，它就把 bot 和群聊建好](docs/images/team.zh.png)

## 安装

**桌面应用（Windows、macOS）**

桌面应用自带 dsh，不用先装 dsh。在 [Releases](https://github.com/Fei2411/DeepSeek-Bot/releases) 里下载：

- Windows（x64）：`DeepSeek-Bot-<版本>-win-x64.exe`。运行它即可安装，只装给当前用户，不要管理员权限。如果提示“Windows 已保护你的电脑”，点 **更多信息** → **仍要运行**。
- macOS：Apple 芯片下载 `DeepSeek-Bot-<版本>-mac-arm64.zip`，Intel 下载 `DeepSeek-Bot-<版本>-mac-x64.zip`。Safari 会自动解压；把 **DeepSeek Bot** 拖进 **应用程序**，再打开。如果提示无法检查这个 App，打开 **系统设置** → **隐私与安全性**，点 **仍要打开**。

第一次打开时，App 会问数据和 Bot 的文件放在哪里，并可以从你的 dsh 复制 Bot 团队（只读取你的 dsh，不改它）。在 App 的设置里配好模型就能用。Windows 版会自动更新；macOS 版有新版本时会提示你下载。

**作为 dsh 插件**

先装好 dsh，并在 dsh 里配好至少一个模型。ds bot 直接使用 dsh 里的模型。

**dsh Desktop（Windows、macOS）**

1. 侧栏点 **插件** → **添加插件**。
2. **包名或地址** 填 `ds-bot`。在中国大陆，**安装源** 选 **中国大陆镜像源**。
3. 点 **安装**，再点 **立即启用**。如果提示“下次启动生效”，完全退出 dsh 再打开。

连不上 npm 时，第 2 步也可以填 [Releases](https://github.com/Fei2411/DeepSeek-Bot/releases) 里下载的 `ds-bot-0.2.0.tgz` 的完整路径，或者 `github:Fei2411/DeepSeek-Bot#v0.2.0&path:/ds-bot`（需要装 Git）。

**dsh Web（Windows、macOS、Linux）**

需要 Node.js `22.19` 以上和 pnpm。

```sh
npx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web add ds-bot
npx @deepseek-ai/dsh@0.2.1-rc.2 web
```

**Docker（NAS、Linux 服务器）**

[`docker/`](docker/) 目录构建一个带 dsh Web 和 DS Bot 的镜像，适合 NAS 或其他常开的机器。CI 已配置为向 GHCR 发布 linux/amd64 预构建镜像。容器就是 bot 的沙箱：bot 对挂进容器的目录有完全权限，其他的碰不到。见 [`docker/README.md`](docker/README.md)（英文）。

## 配置

我强烈建议你直接通过和 bot 对话来配置其他 bot 和群聊。

## 功能

### Bot

你可以在一个窗口中和一个 bot 完成所有对话和工作，你无需担心背后的上下文问题。你可以在 bot 详情页查看 bot 信息，也可以为 bot 选择你想使用的模型。你可以随时切换模型，但我仍然建议你为一个 bot 长期保持一个模型，仅在真正必要的时刻切换。

另外，bot 拥有记忆，它会记住你的喜好并在下次的工作中应用。你可以在 bot 的详情页管理记忆，也可以直接和 bot 对话来进行管理。

![bot 详情页：模型、记忆、用量](docs/images/details.zh.png)

### Main bot

这个 bot 作为你的 chief，它拥有非常高的权限，可以管理其他 bot 和群聊。第一次进入 ds bot 时，默认会有一个 main bot 叫 Chief。你可以直接和它对话，让它引导你完成配置。

总之，有问题，找 main bot。

### 群聊

ds bot 拥有群聊功能。群聊是非常好的多 bot 协作方式，但它会带来非常明显的费用问题。ds bot 为此特意做了优化：在一个群聊中，你需要设置一个管理员。你的消息默认由管理员回复，它会帮你调用其他 bot。你也可以直接 @ 你需要沟通的 bot，它会直接回应你：输入 @，从列表里选 bot 就行。想让 bot 参考另一段对话，点输入框的 + → 引用对话。

任何 bot 都可以用 @ 把活派给另一个 bot。接活的 bot 自己去做，群聊照常进行。它干活时会在群里同步进度，群聊、侧边栏和它自己的聊天里也能看到它在做什么。做完后，它把结果发到群里，由派活的 bot 接着回应。要停下它的工作，打开群聊详情。

群聊有自己的记忆。你在群里交代的事留在群里：群成员在这个群里会用到，你的其他对话和群外的 bot 都看不到。你可以在群聊详情里管理它。

![群聊：管理员 Chief 把活派给写手和程序员](docs/images/group.zh.png)

### 能力

设置 → **能力** 是团队共享的 MCP 服务、技能和能力包列表。在 Bot 设置中启用能力后，从该 Bot 下一条消息开始生效，也适用于它参与的群聊。Bot 添加的本地 MCP 命令需要你先批准才能运行。有其他 Bot 在用的能力，只有你或主 Bot 能修改、删除。

### 用量

在 设置 → 用量 里，可以按时间、按 bot、按模型查看 Token 用量。

![用量页](docs/images/usage.zh.png)

## 数据

所有数据都在你自己的电脑上，在 dsh 主目录（默认 `~/.dsh`）的 `bot/` 和 `sessions/` 里。卸载插件不会删除这些数据。

## 开发

插件源码在 [`ds-bot/`](ds-bot/)。配置项和内部结构见 [`ds-bot/README.md`](ds-bot/README.md)，开发、测试和协作方式见 [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：ds bot 建在 dsh 的插件系统上。每个 bot 都在 dsh 会话里工作，用的是 dsh 的工具和模型。
- [esbuild](https://esbuild.github.io/)：用来打包插件的界面代码。
- 感谢下面这些项目公开的设计思路。ds bot 参考了它们的思路，没有使用它们的代码：
  - [AgentMemoryRepo](https://github.com/AgentMemoryRepo/agentmemoryrepo)：bot 记忆的 Markdown 格式。
  - [OpenAI Codex](https://github.com/openai/codex)：压缩时把用户原话留在摘要旁边，以及搜索聊天记录用的消息锚点。
  - [OpenMausBot](https://github.com/milind-soni/OpenMausBot)：群聊轮流发言和 @ 接力。
  - [Hermes Agent](https://github.com/NousResearch/hermes-agent) 和 [Hermes Bot Mode](https://github.com/NousResearch/Hermes-Bot-Mode)：每个成员在每个群里一个会话，以及交接时带上用户之前的原话。
  - [OpenCode](https://github.com/sst/opencode)、[goose](https://github.com/block/goose)、[pi](https://github.com/badlogic/pi-mono)、[Gemini CLI](https://github.com/google-gemini/gemini-cli)：长对话什么时候压缩，交接笔记写哪些内容。
  - [obelisk](https://github.com/tommy0103/obelisk)：用 SQLite 全文索引搜索聊天记录。
- 每一位试用 ds bot、提问题、报 bug 的人。

## 许可

[Apache License 2.0](LICENSE)。按“原样”提供，不附带任何担保。用到的第三方代码和它的许可见 [NOTICE](NOTICE)。

## 声明

ds bot 是独立的社区项目，**不是 DeepSeek 官方产品**，与 DeepSeek 没有隶属、认可或赞助关系。“DeepSeek”“DeepSeek Harness”等名称是各自所有者的商标，这里只用来说明本插件和什么一起用。

bot 会消耗你自己的模型额度，也会按你的要求读写文件、运行命令。重要的操作请自己检查。
