# FirstRule Go 的 Magpie 插件

将 FirstRule Go 加入 Magpie 的 Agent 页面，连接 Magpie 网关模型，并声明 MCP 和 Skills 的同步位置。实现参考 FirstRule Agent 的 Magpie 插件，针对 Go 版配置目录、命令和资源加载入口适配。

## 安装

从 GitHub 安装：

```sh
magpie plugin add github:Tsingv/magpie-FirstRule-go
```

或在 FirstRule-go 项目根目录使用 submodule：

```sh
git submodule update --init magpie-FirstRule-go
magpie plugin add ./magpie-FirstRule-go
```

在 Magpie 的 Agent 页面启用 **FirstRule Go**。插件不声明单一当前模型键，而是写入 Magpie 提供的完整模型列表；在 FirstRule Go 中使用 `/model` 选择模型。

Magpie 通过配置文件、目录或 PATH 中的 `firstrule` 命令探测程序。若 Agent 页面没有显示它，先启动 FirstRule Go 初始化配置目录，或将 `firstrule` 加入 PATH。Windows 的命令为 `firstrule.exe`，`~` 由 Magpie 按用户主目录展开。

## 配置与资源

| 用途 | 默认路径 |
| --- | --- |
| 模型 | `~/.firstrule-go/agent/models.json` |
| MCP | `~/.firstrule-go/agent/mcp.json` |
| Skills | `~/.firstrule-go/agent/skills/` |

MCP 使用 Claude 的 `mcpServers` 格式。MCP 和 Skills 变更后重启 FirstRule Go。模型配置可以通过重新打开 `/model` 刷新；重启也会重新加载。

使用 `FIRST_RULE_AGENT_DIR` 时，请同步修改 `agent.js` 中的 `dir`、`config`、`library.mcp` 和 `library.skills`。插件默认路径不跟随该变量自动切换。

配置写入独立的 `providers.magpie`。每个模型根据 `native_endpoints` 优先选择 Responses，其次 Messages，最后 Chat Completions。OpenAI 协议使用 `gateway.v1`，缺省时从网关根地址补 `/v1`；Messages 使用 `gateway.url`。未知端点或旧版输入回退为 Messages，由网关转换。模型 ID 保留网关的原始值。

同时映射上下文窗口、输出限制、图像输入、思考档位及价格。价格从每 token 美元转换为每百万 token 美元；缺少缓存价格时填零，输入或输出价格无效时省略整个 `cost`。不表达分档计费。

生成的模型文件包含网关 key，MCP 配置也可能包含凭据，请勿提交这些运行时文件。

## 验证

无 npm 依赖，使用 Node.js 22 或更新版本：

```sh
npm test
```

本次验证：4 项自动测试通过，覆盖路径、协议选择、凭据、价格、思考档位和模型列表；在 Magpie 上游 `3f1f1882ac42224a034ca07b7d997006e9b88af2` 上通过真实 `agentplug.Compile/Connect` 加载验证；生成的配置通过 FirstRule Go 的 `config.Load` 检查，并运行该包测试通过。

未运行：Magpie GUI 操作、真实网关模型请求、MCP/Skills 的 GUI 同步及 Windows 实机验证。上述检查不代表这些场景已完成端到端验收。
