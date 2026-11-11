/** One normalized message/tool interface; provider responses never reach logs. */
import { randomUUID } from 'node:crypto';
export const PROVIDERS = Object.freeze({
  ollama:{baseUrl:'http://localhost:11434',model:''},
  anthropic:{baseUrl:'https://api.anthropic.com/v1',model:'claude-haiku-5-5'},
  openai:{baseUrl:'https://openrouter.ai/api/v1',model:''},
});
export function providerConfig(input = {}) {
  const provider = input.provider || 'ollama', defaults = PROVIDERS[provider];
  if (!defaults) throw new Error('invalid provider');
  const baseUrl = String(input.baseUrl || defaults.baseUrl).replace(/\/+$/,'');
  const url = new URL(baseUrl);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('invalid provider URL; credentials belong in the API key field');
  // Anthropic credentials are never sent to a user-supplied URL.
  if (provider === 'anthropic' && baseUrl !== defaults.baseUrl) throw new Error('invalid Anthropic URL');
  if (input.model != null && (typeof input.model !== 'string' || input.model.length > 256)) throw new Error('invalid model');
  return {provider,baseUrl,model:input.model ?? defaults.model};
}
const serialize = v => JSON.stringify(v,(_k,x) => typeof x === 'bigint' ? x.toString() : x);
function wireMessages(messages, provider) {
  return messages.map(m => {
    if (provider === 'anthropic') {
      if (m.role === 'tool') return {role:'user',content:[{type:'tool_result',tool_use_id:m.toolCallId,content:m.content}]};
      if (m.role === 'assistant' && m.toolCalls?.length) return {role:'assistant',content:[
        ...(m.content ? [{type:'text',text:m.content}] : []),
        ...m.toolCalls.map(t => ({type:'tool_use',id:t.id,name:t.name,input:t.arguments}))]};
      return {role:m.role,content:m.content};
    }
    if (m.role === 'tool') return provider === 'ollama'
      ? {role:'tool',tool_name:m.name,content:m.content}
      : {role:'tool',tool_call_id:m.toolCallId,content:m.content};
    return {role:m.role,content:m.content,...(m.toolCalls?.length ? {tool_calls:m.toolCalls.map(t => ({
      id:t.id,type:'function',function:{name:t.name,arguments:provider === 'ollama' ? t.arguments : serialize(t.arguments)},
    }))} : {})};
  });
}
export class LLM {
  constructor(config = {}, {getKey = async () => ''} = {}) { this.config=providerConfig(config); this.getKey=getKey; }
  async request(endpoint, body) {
    const {provider,baseUrl} = this.config, headers = {'content-type':'application/json'};
    if (provider !== 'ollama') {
      const key = await this.getKey(provider);
      if (!key) throw new Error(`Setup required: ${provider} API key`);
      if (provider === 'anthropic') Object.assign(headers,{'x-api-key':key,'anthropic-version':'2023-06-01'});
      else headers.authorization = `Bearer ${key}`;
    }
    let response;
    try { response = await fetch(baseUrl+endpoint,{method:body?'POST':'GET',headers,
      ...(body?{body:serialize(body)}:{}),signal:AbortSignal.timeout(60000),redirect:'error'}); }
    catch { throw new Error(`${provider} request failed; check provider URL and connection`); }
    // Do not echo upstream bodies: they can contain a credential or request text.
    if (!response.ok) throw new Error(`${provider} HTTP ${response.status}`);
    return response.json();
  }
  async models() {
    const {provider} = this.config, rows = []; let after;
    do {
      const j = await this.request(provider === 'ollama' ? '/api/tags' : '/models'+(after?`?after_id=${encodeURIComponent(after)}`:''));
      rows.push(...(provider === 'ollama' ? j.models || [] : j.data || []).map(m => ({id:m.id || m.name,name:m.display_name || m.name || m.id})));
      after = provider === 'anthropic' && j.has_more ? j.last_id : null;
      if (rows.length > 10000) throw new Error('provider model list too large');
    } while (after);
    return rows;
  }
  async chat({messages,system = '',tools = []}) {
    const {provider} = this.config;
    let model = this.config.model;
    if (!model) {
      if (provider !== 'ollama') throw new Error('Setup required: select a model');
      model = (await this.models())[0]?.id;
      if (!model) throw new Error('Setup required: pull an Ollama model');
    }
    const wire = wireMessages(messages,provider);
    const body = {model,messages:provider === 'anthropic' ? wire : [...(system?[{role:'system',content:system}]:[]),...wire],
      ...(provider === 'anthropic' ? {system,max_tokens:2048} : {stream:false}),
      ...(tools.length ? {tools:tools.map(t => provider === 'anthropic'
        ? {name:t.name,description:t.description,input_schema:t.parameters}
        : {type:'function',function:t})} : {})};
    const j = await this.request(provider === 'ollama' ? '/api/chat' : provider === 'anthropic' ? '/messages' : '/chat/completions',body);
    let content, calls;
    if (provider === 'anthropic') {
      content = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      calls = (j.content || []).filter(b => b.type === 'tool_use').map(b => ({id:b.id,name:b.name,arguments:b.input}));
    } else {
      const m = provider === 'ollama' ? j.message : j.choices?.[0]?.message;
      if (!m) throw new Error(`${provider} returned no assistant message`);
      content = m.content || '';
      calls = (m.tool_calls || []).map(t => ({id:t.id || randomUUID(),name:t.function.name,
        arguments:typeof t.function.arguments === 'string' ? JSON.parse(t.function.arguments) : t.function.arguments}));
    }
    return {role:'assistant',content,toolCalls:calls,model:j.model || model,provider};
  }
}
