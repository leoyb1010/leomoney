/**
 * Leomoney Agent 大脑 — LLM 调用层
 * 支持 DeepSeek / Qwen / OpenAI / Ollama 本地
 * 统一 chat/completions 接口，低温度（交易决策要确定性）
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

  const url = new URL(config.endpoint);
  const transport = url.protocol === 'https:' ? https : http;

  const body = JSON.stringify({
    model: process.env.LLM_MODEL || config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

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
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) return reject(new Error('LLM 返回空内容'));
          resolve(JSON.parse(content));
        } catch (e) {
          reject(new Error('LLM 响应解析失败: ' + e.message + '\n原始: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('LLM 请求超时(30s)')); });
    req.write(body);
    req.end();
  });
}

/**
 * 检查 LLM 配置是否就绪
 */
function isLLMReady() {
  const providerName = process.env.LLM_PROVIDER || 'deepseek';
  if (providerName === 'local') return true;
  return !!process.env.LLM_API_KEY;
}

module.exports = { askLLM, isLLMReady, PROVIDERS };
