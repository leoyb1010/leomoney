/**
 * Leomoney Agent 大脑 — LLM 调用层
 * 支持 DeepSeek / Qwen / OpenAI / Ollama 本地
 * 统一 chat/completions 接口，低温度（交易决策要确定性）
 *
 * 2026-04-24: 适配 deepseek-reasoner（不支持 response_format/temperature）
 * 2026-04-24: 切换默认模型为 deepseek-v4-flash（支持 response_format）
 */

const https = require('https');
const http = require('http');

const PROVIDERS = {
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
  },
  qwen: {
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-max',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
  },
  local: {
    endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
    model: 'qwen3',
  },
};

// 不支持 response_format 和 temperature 的模型
const REASONER_MODELS = ['deepseek-reasoner', 'deepseek-r1'];

function isReasonerModel(model) {
  if (!model) return false;
  return REASONER_MODELS.some(r => model.toLowerCase().includes(r));
}

/**
 * 调用 LLM，返回解析后的 JSON 对象
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userMessage - 用户消息（通常包含行情/持仓/新闻）
 * @returns {Promise<Object>} LLM 返回的 JSON 决策
 */
async function askLLM(systemPrompt, userMessage) {
  const providerName = process.env.LLM_PROVIDER || 'deepseek';
  const apiKey = process.env.LLM_API_KEY;
  const config = PROVIDERS[providerName];

  if (!config) throw new Error(`未知 LLM provider: ${providerName}`);
  if (!apiKey && providerName !== 'local') {
    throw new Error('LLM_API_KEY 环境变量未设置。请设置后重试，或使用 LLM_PROVIDER=local');
  }

  const model = process.env.LLM_MODEL || config.model;
  const url = new URL(config.endpoint);
  const transport = url.protocol === 'https:' ? https : http;
  const reasoner = isReasonerModel(model);

  // 构建 request body — reasoner 模型不支持 response_format 和 temperature
  const bodyObj = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };
  if (!reasoner) {
    bodyObj.temperature = 0.3;
    bodyObj.response_format = { type: 'json_object' };
  }

  const body = JSON.stringify(bodyObj);

  return new Promise((resolve, reject) => {
    const req = transport.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || 'ollama'}`,
        'Content-Length': Buffer.byteLength(body),
      },
      rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(`LLM API 错误: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          }
          const message = parsed.choices?.[0]?.message;
          if (!message) return reject(new Error('LLM 返回空内容'));

          // deepseek-reasoner 有 reasoning_content 字段（思考过程），content 是最终输出
          const content = message.content;
          if (!content) return reject(new Error('LLM 返回空内容'));

          // 尝试解析 JSON — reasoner 模型输出可能包含 markdown 代码块
          const jsonStr = _extractJSON(content);
          try {
            resolve(JSON.parse(jsonStr));
          } catch (parseErr) {
            // 如果 JSON 解析失败，返回原始文本包装
            console.warn('[Brain] JSON 解析失败，返回原始内容:', content.slice(0, 200));
            resolve({ action: '观望', 原因: 'LLM 输出格式异常，原始内容: ' + content.slice(0, 500), 置信度: 0, 风险等级: '高' });
          }
        } catch (e) {
          reject(new Error('LLM 响应解析失败: ' + e.message + '\n原始: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('LLM 请求超时(60s)')); }); // reasoner 需要更长超时
    req.write(body);
    req.end();
  });
}

/**
 * 从 LLM 输出中提取 JSON
 * 支持: 纯 JSON、```json ... ``` 代码块、混合文本中的 JSON
 */
function _extractJSON(text) {
  // 尝试直接解析
  try { JSON.parse(text); return text; } catch {}

  // 尝试提取 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try { JSON.parse(codeBlockMatch[1]); return codeBlockMatch[1]; } catch {}
  }

  // 尝试找第一个 { ... } 配对
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    for (let i = firstBrace; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      if (depth === 0) {
        const candidate = text.slice(firstBrace, i + 1);
        try { JSON.parse(candidate); return candidate; } catch {}
        break;
      }
    }
  }

  return text; // 返回原始文本，让调用方处理
}

/**
 * 检查 LLM 配置是否就绪
 */
function isLLMReady() {
  const providerName = process.env.LLM_PROVIDER || 'deepseek';
  if (providerName === 'local') return true;
  return !!process.env.LLM_API_KEY;
}

/**
 * 获取当前模型信息
 */
function getLLMInfo() {
  const providerName = process.env.LLM_PROVIDER || 'deepseek';
  const config = PROVIDERS[providerName];
  const model = process.env.LLM_MODEL || config?.model || 'unknown';
  return { provider: providerName, model, reasoner: isReasonerModel(model) };
}

module.exports = { askLLM, isLLMReady, getLLMInfo, PROVIDERS };
