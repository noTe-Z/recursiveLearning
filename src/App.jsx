import React, { useState, useEffect, useRef } from 'react';
import { Send, Layers, ArrowUpCircle, X, CheckCircle, AlertCircle, Lock, Play, Settings, Database, FileText, ChevronRight, CornerDownRight } from 'lucide-react';

// --- V4 PROMPT ENGINEERING: ACTION-FIRST ---

const CHAT_SYSTEM_PROMPT = `
你是一个 "Recursive Learning Agent" (递归学习助手)。
你的核心任务是维护用户的 "思维栈 (Stack)" 并回答问题。

**关键协议：Action-First (先行动，后回答)**
你不能直接回答用户的问题。你必须先分析用户的意图，更新 Stack 状态，然后再生成回答。

**逻辑判断规则：**
1. **PUSH (下钻/追问)**: 如果用户的问题是关于当前节点的一个具体细节、子概念、或者因为不懂当前概念而发起的追问。 -> 必须生成新的子节点。
2. **STAY (平行/澄清)**: 如果用户只是让换个说法解释、举例，或者在聊当前节点的同一层级内容。 -> 保持当前节点 Active。
3. **TRIGGER_GATE (回溯)**: 如果用户说"懂了"、"回到上一层"。 -> 触发 Gate 信号。

**输出格式 (严格遵守):**
你必须以一个 JSON 代码块开头，然后才是你的回答。

格式示例：
\`\`\`json
{
  "action": "PUSH", // or "STAY", "TRIGGER_GATE"
  "updated_stack": [ ...完整的 stack 数组... ],
  "reason": "用户询问了 Q 矩阵的具体计算，属于 Self-Attention 的子细节，因此下钻。"
}
\`\`\`

(在 JSON 块结束后，这里开始你的自然语言回答...)

**当前 Stack 结构定义:**
Stack 是一个对象数组: { id: string, topic: string, level: number, status: "Active" | "Waiting" | "Done" }
`;

// 验证门控 Prompt (保持不变)
const GATE_PROMPT = `
你是一个严格的考官。
用户试图从 [Child Topic] 回溯到 [Parent Topic]。
请验证用户的理解。
输出 JSON: { "approved": boolean, "feedback": string }
`;

export default function RecursiveAgentV4() {
  // --- State ---
  const [apiKey, setApiKey] = useState('');
  const [goal, setGoal] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // The Stack State (Now managed as a pure JS object, not raw markdown text)
  const [stack, setStack] = useState([]); 
  const [sourceText, setSourceText] = useState('');
  const [activeTab, setActiveTab] = useState('stack');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [gateData, setGateData] = useState(null); // { child, parent }
  const [synthesisInput, setSynthesisInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Initializer ---
  const handleStart = () => {
    if (!goal.trim()) return;
    const rootNode = { id: 'root', topic: goal, level: 0, status: 'Active' };
    setStack([rootNode]);
    setIsStarted(true);
    addMessage('system', `深度学习流已启动。目标：${goal}。请提出第一个问题。`);
  };

  const addMessage = (role, text) => {
    setMessages(prev => [...prev, { role, text }]);
  };

  // --- Core Logic: Chat & Action Parsing ---
  const handleSend = async () => {
    if (!input.trim() || isLoading || !apiKey) return;

    const userMsg = input;
    setInput('');
    addMessage('user', userMsg);
    setIsLoading(true);

    try {
      // 1. Construct Prompt
      const fullPrompt = `
${CHAT_SYSTEM_PROMPT}

**当前 Stack 状态 (JSON):**
${JSON.stringify(stack, null, 2)}

**原文锚定 (Source Context):**
${sourceText ? sourceText.substring(0, 2000) : "无"}

**用户输入:**
${userMsg}
      `;

      // 2. Call API
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
      });

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // 3. Parse "Action-First" Response
      // Logic: Extract the first JSON block for State, use the rest for Chat
      const jsonMatch = rawText.match(/```json([\s\S]*?)```/);
      
      let chatContent = rawText;

      if (jsonMatch) {
        try {
          const actionData = JSON.parse(jsonMatch[1]);
          console.log("AI Action Decision:", actionData); // Debug log

          // A. Handle Stack Update (PUSH / STAY)
          if (actionData.updated_stack && Array.isArray(actionData.updated_stack)) {
            setStack(actionData.updated_stack);
          }

          // B. Handle Gate Trigger
          if (actionData.action === 'TRIGGER_GATE') {
             // Find active node and its parent
             const activeNode = stack.find(n => n.status === 'Active');
             if (activeNode && activeNode.level > 0) {
                const parentNode = stack.find(n => n.level === activeNode.level - 1); // Simplistic parent finding
                // We should actually trigger the modal manually here or add a system message
                addMessage('system', '检测到回溯意图。请点击右侧父节点进行验证，或继续提问。');
             }
          }

          // Clean up chat content (remove the JSON block)
          chatContent = rawText.replace(jsonMatch[0], '').trim();

        } catch (e) {
          console.error("JSON Parse Error", e);
        }
      }

      addMessage('assistant', chatContent);

    } catch (e) {
      addMessage('system', `Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Logic: Manual Gate Trigger (Clicking Parent) ---
  const handleNodeClick = (node) => {
    // Logic: User clicked a node. 
    // If it is the PARENT of the currently Active node, trigger Gate.
    const activeNode = stack.find(n => n.status === 'Active');
    
    if (!activeNode) return;
    
    // Check if clicked node is immediate parent (level check + logic)
    // For this simple tree, we assume parent is the last node with level = active.level - 1
    if (node.level === activeNode.level - 1) {
       setGateData({ child: activeNode, parent: node });
       setIsModalOpen(true);
       setVerificationResult(null);
       setSynthesisInput('');
    }
  };

  // --- Logic: Verify & Pop ---
  const handleVerification = async () => {
    if (!synthesisInput || isVerifying) return;
    setIsVerifying(true);

    try {
      const prompt = `
${GATE_PROMPT}
Context: Child "${gateData.child.topic}" -> Parent "${gateData.parent.topic}"
User Synthesis: "${synthesisInput}"
Return JSON only.
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const result = JSON.parse(data.candidates[0].content.parts[0].text);
      setVerificationResult(result);

      if (result.approved) {
        // EXECUTE POP LOGIC
        const newStack = stack.filter(n => n.id !== gateData.child.id); // Remove child
        // Reactivate parent
        const parentIndex = newStack.findIndex(n => n.id === gateData.parent.id);
        if (parentIndex >= 0) newStack[parentIndex].status = 'Active';
        
        setStack(newStack);
        
        setTimeout(() => {
          setIsModalOpen(false);
          addMessage('system', `✅ 验证通过。思维栈已回溯至: ${gateData.parent.topic}`);
        }, 1500);
      }

    } catch(e) {
      alert(e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // --- Rendering Helpers ---

  const renderStack = () => {
    if (stack.length === 0) return <div className="text-slate-500 text-xs text-center mt-10">Waiting for initialization...</div>;

    // Find active index to determine relationship
    const activeIndex = stack.findIndex(n => n.status === 'Active');
    const activeNode = stack[activeIndex];

    return (
      <div className="space-y-2 relative">
         {/* Connector Line */}
         <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-800 -z-10"></div>

         {stack.map((node, idx) => {
           const isActive = node.status === 'Active';
           const isParent = activeNode && node.level === activeNode.level - 1;
           
           return (
             <div 
               key={idx}
               onClick={() => isParent && handleNodeClick(node)}
               className={`
                 relative flex items-center p-3 rounded-lg transition-all duration-300 border
                 ${isActive ? 'bg-indigo-600/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)] ml-4' : 
                   isParent ? 'bg-slate-800 border-slate-700 cursor-pointer hover:border-emerald-500 hover:bg-slate-700 ml-0 opacity-80' : 
                   'bg-slate-900 border-slate-800 ml-0 opacity-40 grayscale'}
               `}
               style={{ marginLeft: `${node.level * 20}px` }}
             >
               {/* Icon */}
               <div className={`mr-3 p-1.5 rounded-full ${isActive ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                 {isActive ? <CornerDownRight size={14}/> : <Layers size={14}/>}
               </div>

               {/* Content */}
               <div className="flex-1 min-w-0">
                 <div className="flex justify-between items-baseline">
                   <span className="text-[10px] text-slate-500 font-mono uppercase">Lvl {node.level}</span>
                   {isActive && <span className="text-[9px] bg-indigo-500 text-white px-1.5 rounded animate-pulse">CURRENT</span>}
                 </div>
                 <div className={`text-sm font-bold truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>
                   {node.topic}
                 </div>
               </div>

               {/* Hover Action for Parent */}
               {isParent && (
                 <div className="absolute right-2 text-emerald-400 animate-bounce">
                   <ArrowUpCircle size={18} />
                 </div>
               )}
             </div>
           );
         })}
      </div>
    );
  };

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 p-8 rounded-xl border border-slate-800 shadow-2xl">
          <div className="flex items-center gap-3 mb-6 text-indigo-400">
            <Settings size={32} />
            <h1 className="text-2xl font-bold">DeepFlow V4</h1>
          </div>
          <div className="space-y-4">
             <div>
                <label className="text-xs font-bold text-slate-500 uppercase">API Key</label>
                <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"/>
             </div>
             <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Learning Goal</label>
                <input type="text" value={goal} onChange={e=>setGoal(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"/>
             </div>
             <button onClick={handleStart} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded flex justify-center gap-2"><Play size={18}/> Start Recursive Engine</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-200 flex font-sans overflow-hidden">
      
      {/* 1. LEFT: CHAT STREAM (Silent Explorer) */}
      <div className="flex-1 flex flex-col border-r border-slate-800 bg-slate-950 relative">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex justify-between items-center z-10">
           <h2 className="font-bold text-slate-200 text-sm flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]"></div>
             Exploration Stream
           </h2>
           <div className="text-[10px] text-slate-500 font-mono">Action-First Protocol Active</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 pb-24">
           {messages.map((msg, i) => (
             <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
               <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm ${
                 msg.role === 'user' ? 'bg-indigo-600 text-white' : 
                 msg.role === 'system' ? 'bg-slate-800 text-yellow-500/80 text-xs border border-yellow-500/20' :
                 'bg-slate-900 text-slate-300 border border-slate-800'
               }`}>
                 {msg.text}
               </div>
             </div>
           ))}
           {isLoading && <div className="ml-4 text-xs text-indigo-400 animate-pulse flex gap-2 items-center">Thinking & Updating Stack...</div>}
           <div ref={messagesEndRef} />
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 to-transparent">
           <div className="relative shadow-2xl">
              <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ask a follow-up question..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-12 py-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
              />
              <button onClick={handleSend} className="absolute right-2 top-2 bottom-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white px-3 rounded-lg transition-all">
                <Send size={18}/>
              </button>
           </div>
        </div>
      </div>

      {/* 2. RIGHT: CONTEXT CONSOLE */}
      <div className="w-[420px] bg-slate-900 flex flex-col border-l border-slate-800 shadow-2xl z-20">
         {/* Tabs */}
         <div className="flex border-b border-slate-800">
            <button onClick={() => setActiveTab('stack')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'stack' ? 'bg-slate-800 text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
               <Layers size={14}/> Mind Stack
            </button>
            <button onClick={() => setActiveTab('source')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'source' ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
               <FileText size={14}/> Source
            </button>
         </div>

         <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800">
            {activeTab === 'stack' ? renderStack() : (
               <div className="h-full flex flex-col">
                  <div className="text-xs text-slate-400 mb-2 flex justify-between">
                     <span>Paste context below (Code, Paper, Article):</span>
                     {sourceText && <span className="text-emerald-500">Active</span>}
                  </div>
                  <textarea 
                    value={sourceText}
                    onChange={e => setSourceText(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
                    placeholder="// Paste code or text here..."
                  />
               </div>
            )}
         </div>
      </div>

      {/* 3. CENTER: THE FEYNMAN GATE (MODAL) */}
      {isModalOpen && gateData && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                 <div className="font-bold text-emerald-400 flex items-center gap-2">
                    <Lock size={16}/> Knowledge Checkpoint
                 </div>
                 <button onClick={() => setIsModalOpen(false)}><X size={18} className="text-slate-500 hover:text-white"/></button>
              </div>

              <div className="p-6 overflow-y-auto">
                 <div className="flex flex-col items-center gap-2 mb-6">
                    <span className="text-xs text-slate-500 uppercase font-bold">Connecting</span>
                    <div className="flex items-center gap-3 text-sm font-bold">
                       <span className="text-indigo-300 bg-indigo-900/50 px-3 py-1 rounded border border-indigo-700/50">{gateData.child.topic}</span>
                       <ArrowUpCircle size={16} className="text-slate-600"/>
                       <span className="text-emerald-300 bg-emerald-900/50 px-3 py-1 rounded border border-emerald-700/50">{gateData.parent.topic}</span>
                    </div>
                 </div>

                 <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                    To pop the stack, prove you've synthesized this knowledge. 
                    <br/>
                    <span className="text-slate-500 text-xs mt-1 block">
                       Hint: How does the specific logic of the child node solve the broader problem of the parent node?
                    </span>
                 </p>

                 <textarea 
                    value={synthesisInput}
                    onChange={e => setSynthesisInput(e.target.value)}
                    placeholder="E.g. The transpose is necessary because..."
                    className="w-full h-32 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm focus:border-emerald-500 focus:outline-none resize-none mb-4"
                 />

                 {verificationResult && (
                    <div className={`p-3 rounded border text-sm ${verificationResult.approved ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400' : 'bg-red-900/20 border-red-800 text-red-400'}`}>
                       <div className="font-bold mb-1 flex items-center gap-2">
                          {verificationResult.approved ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
                          {verificationResult.approved ? 'Approved' : 'Refinement Needed'}
                       </div>
                       <div className="opacity-90 text-xs">{verificationResult.feedback}</div>
                    </div>
                 )}
              </div>

              <div className="p-4 bg-slate-800/50 border-t border-slate-800 flex justify-end gap-3">
                 <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-sm px-3">Cancel</button>
                 <button 
                   onClick={handleVerification}
                   disabled={isVerifying || verificationResult?.approved}
                   className={`px-4 py-2 rounded font-bold text-sm transition-all flex items-center gap-2 ${verificationResult?.approved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                 >
                    {isVerifying ? 'Verifying...' : verificationResult?.approved ? 'Closing Stack...' : 'Submit Synthesis'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
