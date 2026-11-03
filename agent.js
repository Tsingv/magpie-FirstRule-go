// Provider 独立写入 FirstRule Go 的配置目录。
const PROVIDER_ID = "magpie";

// 两条来自 magpie 的点分写入约束：
// 1. 中间节点只会建「对象」，从不建数组。所以 `models.0.id` 会写成
//    {"models": {"0": {...}}}，而 FirstRule Go 的 schema 要求 models 是数组，整份配置
//    校验失败、provider 被整体丢弃。models 必须作为一个完整数组一次写入。
// 2. 只改「写过」的键并保留其余键，整个模型列表一次替换。

// 缺少原生端点信息（旧版 Magpie、路由组等）时沿用 Messages 网关转换。
const GATEWAY_API = "anthropic-messages";

// 同时支持多个端点时优先 Responses，其次 Messages，最后 Chat Completions。
const NATIVE_APIS = [
  ["/v1/responses", "openai-responses"],
  ["/v1/messages", "anthropic-messages"],
  ["/v1/chat/completions", "openai-completions"],
];

function nativeConnection(endpoints, gateway) {
  if (!Array.isArray(endpoints)) return undefined;
  const match = NATIVE_APIS.find(([endpoint]) => endpoints.includes(endpoint));
  if (!match) return undefined;
  const api = match[1];
  return {
    api,
    baseUrl: api === "anthropic-messages"
      ? gateway.url
      : gateway.v1 || `${gateway.url.replace(/\/+$/, "")}/v1`,
  };
}

function modelCost(pricing) {
  if (!pricing || typeof pricing !== "object") return undefined;
  const cost = {};
  for (const [target, source] of [
    ["input", "prompt"],
    ["output", "completion"],
    ["cacheRead", "input_cache_read"],
    ["cacheWrite", "input_cache_write"],
  ]) {
    const raw = pricing[source];
    // 移动十进制指数，避免乘法把 0.0000004 写成 0.39999999999999997。
    const text = typeof raw === "number" || typeof raw === "string" ? String(raw).trim() : "";
    const decimal = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:e([+-]?\d+))?$/i.exec(text);
    const value = decimal ? Number(`${decimal[1]}e${Number(decimal[2] || 0) + 6}`) : NaN;
    if (Number.isFinite(value) && value >= 0) cost[target] = value;
    else if (target === "input" || target === "output") return undefined;
    else cost[target] = 0;
  }
  return cost;
}

// FirstRule Go 的思考档位；magpie 用 efforts 表示模型支持的档位，其中 "none" 对应 off。
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function entriesOf(model, models) {
  const all = Array.isArray(models) ? models.filter(Boolean) : [];
  if (all.length > 0) return all;
  if (Array.isArray(model)) return model.filter(Boolean);
  return model ? [model] : [];
}

// magpie 的 efforts 是模型支持的档位列表，如 ["low","high","max"] 或 ["none","max"]。
// FirstRule Go 的 thinkingLevelMap 为每个档位给出上游值（null 表示不支持）。仅凭 efforts
// 无法区分「支持但同名」与「不支持」，但档位不在列表里必然是 null，在列表里就是
// 同名值（"none" 映射到 off），这已能与 magpie 写 pi 的结果一致。
function thinkingLevelMap(efforts) {
  if (!Array.isArray(efforts) || efforts.length === 0) return undefined;
  const supported = new Set(efforts.map((level) => (level === "none" ? "off" : level)));
  const map = {};
  for (const level of THINKING_LEVELS) {
    map[level] = supported.has(level) ? (level === "off" ? "none" : level) : null;
  }
  return map;
}

function toModel(entry, gateway) {
  const model = { id: entry.id, name: entry.name || entry.id };
  const connection = nativeConnection(entry.native_endpoints, gateway);
  if (connection) Object.assign(model, connection);
  const cost = modelCost(entry.pricing);
  if (cost) model.cost = cost;
  const contextWindow = positiveNumber(entry.context);
  const maxTokens = positiveNumber(entry.output);
  model.input = entry.images ? ["text", "image"] : ["text"];
  model.reasoning = Array.isArray(entry.efforts) && entry.efforts.length > 0;
  if (contextWindow !== undefined) model.contextWindow = contextWindow;
  if (maxTokens !== undefined) model.maxTokens = maxTokens;
  const levels = thinkingLevelMap(entry.efforts);
  if (levels !== undefined && model.reasoning) model.thinkingLevelMap = levels;
  return model;
}

export const agent = {
  id: "firstrule-go",
  name: "FirstRule Go",
  // 配置文件、目录或 PATH 中的命令任一存在，Magpie 即可探测到。
  bin: "firstrule",
  dir: "~/.firstrule-go/agent",
  config: "~/.firstrule-go/agent/models.json",
  format: "json",
  // 不写 model：FirstRule 没有单一「当前模型」键，它读取整个 magpie
  // provider，把选中的模型存在自己的会话里（/model）。省略后 magpie 不显示
  // 模型选择器，只写 connect 返回的全部模型。
  library: {
    mcp: "~/.firstrule-go/agent/mcp.json",
    mcpFormat: "claude",
    skills: "~/.firstrule-go/agent/skills",
  },
  notice: "Restart FirstRule Go after changing its Magpie models.",
};

export function connect({ gateway, model, models }) {
  const entries = entriesOf(model, models).filter(
    (entry) => typeof entry.id === "string" && entry.id !== "",
  );

  return {
    [`providers.${PROVIDER_ID}.name`]: "Magpie Gateway",
    // Anthropic Messages 的路径是 baseUrl + /v1/messages，所以 baseUrl 用不带
    // /v1 的网关根地址（gateway.url）。
    [`providers.${PROVIDER_ID}.baseUrl`]: gateway.url,
    [`providers.${PROVIDER_ID}.api`]: GATEWAY_API,
    [`providers.${PROVIDER_ID}.apiKey`]: gateway.key,
    [`providers.${PROVIDER_ID}.models`]: entries.map((entry) => toModel(entry, gateway)),
  };
}
