import { TOOLS, executeTool } from './agent-tools.mjs';
const json = v => JSON.stringify(v,(_k,x) => typeof x === 'bigint' ? x.toString() : x);
export class Agent {
  constructor({llm,request,signals,publish=()=>{}}) { Object.assign(this,{llm,request,signals,publish}); }
  async reply({message,messages=[],system='All trades require the gate. Never claim execution without a confirmed signature.',onMessage=async()=>{}}) {
    if (typeof message !== 'string' || !message.trim() || message.length>16000) throw new Error('invalid chat message');
    const transcript = structuredClone(messages), added=[];
    const append = async m => { await onMessage(m); transcript.push(m); added.push(m); this.publish({type:'agent_message',message:m}); };
    await append({role:'user',content:message});
    let calls=0;
    for (let round=0;round<6;round++) {
      const response = await this.llm.chat({messages:transcript,system,tools:TOOLS});
      await append(response);
      if (!response.toolCalls?.length) return {text:response.content,model:response.model,provider:response.provider,messages:added};
      // Finish every call in a message so provider tool/result pairs stay valid.
      for (const call of response.toolCalls) {
        let result;
        try {
          if (++calls>16) throw new Error('agent tool call limit reached');
          result = await executeTool(call.name,call.arguments,this);
        } catch (e) { result={error:e.message}; }
        let content=json(result);
        if (content.length>100000) content=json({error:'tool result too large; narrow the query'});
        await append({role:'tool',name:call.name,toolCallId:call.id,content,model:response.model,provider:response.provider});
      }
    }
    throw new Error('agent turn limit reached; tool calls and results are in the transcript');
  }
}
