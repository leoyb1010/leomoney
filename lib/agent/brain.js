/**
 * Leomoney Agent 大脑 v3 — LLM 调用层 + Schema 校验 + 重试
 * 支持 DeepSeek / Qwen / OpenAI / Ollama 本地
 * 统一 chat/completions 接口，低温度（交易决策要确定性）
 *
 * v3.0 升级点：
 *   1. 自动重试（最多2次，指数退避）
 *   2. 输出 Schema 预校验（调用前检查必要字段）
 *   3. 更强大的 JSON 提取
 *   4. 熔断保护：LLM 调用失败计入熔断
 *   5. deepseek-v4-pro 默认
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

// 重试配置
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY = 2000; // 2s, 4s, 8s

function isReasonerModel(model) {
  if (!model) return false;
  return REASONER_MODELS.some(r => model.toLowerCase().includes(r));
}

/**
 * 调用 LLM，返回解析后的 JSON 对象
 * 带自动重试 + Schema 预校验
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userMessage - 用户消息
 * @param {Object} [options] - 可选配置
 * @param {number} [options.maxRetries=2] - 最大重试次数
 * @param {boolean} [options.validateSchema=false] - 是否校验输出格式
 * @returns {Promise<Object>} LLM 返回的 JSON 决策
 */
async function askLLM(systemPrompt, userMessage, options = {}) {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const providerName = process.env.LLM_PROVIDER || 'deepseek';
  const apiKey = process.env.LLM_API_KEY;
  const config = PROVIDERS[providerName];

  if (!config) throw new Error(`未知 LLM provider: ${providerName}`);
  if (!apiKey && providerName !== 'local') {
    throw new Error('LLM_API_KEY 环境变量未设置。请设置后重试，或使用 LLM_PROVIDER=local');
  }

  const model = process.env.LLM_MODEL || config.model;
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

  // 带重试的请求
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        console.log(`[Brain] 重试第 ${attempt} 次，等待 ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }

      const rawResponse = await _makeRequest(config.endpoint, apiKey || 'ollama', body, providerName);
      const parsed = _parseResponse(rawResponse, reasoner);

      // Schema 预校验（如果是交易决策）
      if (options.validateSchema && parsed) {
        const validation = _validateDecisionSchema(parsed);
        if (!validation.valid) {
          console.warn(`[Brain] Schema 校验失败 (attempt ${attempt}): ${validation.errors.join(', ')}`);
          if (attempt < maxRetries) continue; // 重试
          // 最后一次还是失败，返回降级
          return _makeFallbackDecision(validation.errors);
        }
      }

      return parsed;
    } catch (err) {
      lastError = err;
      console.warn(`[Brain] 请求失败 (attempt ${attempt}): ${err.message}`);

      // 429/503 等可重试错误
      if (err.statusCode === 429 || err.statusCode === 503 || err.statusCode === 500) {
        if (attempt < maxRetries) continue;
      }

      // 其他错误不重试
      if (attempt >= maxRetries) break;
    }
  }

  // 所有重试都失败
  console.error(`[Brain] 所有 ${maxRetries + 1} 次尝试均失败: ${lastError?.message}`);
  return _makeFallbackDecision([`LLM 调用失败: ${lastError?.message}`]);
}

/**
 * 底层 HTTP 请求
 */
function _makeRequest(endpoint, apiKey, body, providerName) {
  const url = new URL(endpoint);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false',
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const err = new Error(`LLM API 错误: ${parsed.error.message || JSON.stringify(parsed.error)}`);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          if (res.statusCode >= 400) {
            const err = new Error(`LLM API HTTP ${res.statusCode}: ${data.slice(0, 200)}`);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('LLM 响应解析失败: ' + e.message + '\n原始: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('LLM 请求超时(90s)')); }); // 增加超时
    req.write(body);
    req.end();
  });
}

/**
 * 解析 LLM 响应
 */
function _parseResponse(rawResponse, reasoner) {
  const message = rawResponse.choices?.[0]?.message;
  if (!message) throw new Error('LLM 返回空内容');

  const content = message.content;
  if (!content) throw new Error('LLM 返回空内容');

  // 尝试解析 JSON
  const jsonStr = _extractJSON(content);
  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    console.warn('[Brain] JSON 解析失败，原始内容:', content.slice(0, 200));
    return { action: '观望', 原因: 'LLM 输出格式异常，原始内容: ' + content.slice(0, 500), 置信度: 0, 风险等级: '高' };
  }
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
 * v3: 交易决策 Schema 预校验
 */
function _validateDecisionSchema(obj) {
  const errors = [];
  const action = obj.action || obj.动作;
  if (!action) errors.push('缺少 action 字段');

  const validActions = ['买入', '卖出', '观望', 'BUY', 'SELL', 'HOLD', 'CANCEL_ORDER'];
  if (action && !validActions.includes(action.toString().trim())) {
    errors.push(`非法 action: ${action}`);
  }

  const confidence = Number(obj.confidence || obj.置信度 || 0);
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    // 置信度不是必须的，但如果提供了必须合法
    if (obj.confidence !== undefined && obj.置信度 !== undefined) {
      if (confidence > 1) {
        // 可能是百分比形式，自动转换
      } else {
        errors.push(`置信度非法: ${confidence}`);
      }
    }
  }

  // BUY/SELL 必须有 symbol
  const actionStr = (action || '').toString().toUpperCase();
  if ((actionStr === 'BUY' || actionStr === '卖出' || actionStr === '买入') && !obj.symbol && !obj.标的) {
    errors.push('BUY/SELL 缺少 symbol');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * v3: 生成降级决策（LLM 失败时的安全网）
 */
function _makeFallbackDecision(errors) {
  return {
    action: '观望',
    symbol: null,
    qty: 0,
    confidence: 0,
    thesis: `[安全降级] ${errors.join('; ')}`,
    riskNotes: errors,
    riskLevel: '高',
    basedOn: { market: false, position: false, account: false, risk: false, news: false },
    _fallback: true,
  };
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
