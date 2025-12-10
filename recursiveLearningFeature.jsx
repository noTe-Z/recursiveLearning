import React, { useState, useEffect, useRef } from 'react';
import { Send, Layers, RotateCcw, Save, Play, Settings, ChevronRight, CornerDownLeft, Database, AlertCircle, CheckCircle2 } from 'lucide-react';

// --- System Prompt Configuration ---
const SYSTEM_PROMPT = `
你是一个“递归学习引擎 (Recursive Learning Engine)”。
你的核心任务不是聊天，而是维护一个“学习状态文档 (Stack-Doc)”。

**协议规则 (PROTOCOL):**
1. **状态唯一性**: 你的记忆是短暂的，只有提供的 markdown 文档是持久的。一切以文档中的 Stack 为准。
2. **操作逻辑**:
   - **PUSH (下钻)**: 用户询问新概念 -> 将其压入 Stack 最底层 (标记为 Active)。
   - **EXPLAIN (解释)**: 用户询问当前层级概念 -> 解释它。
   - **POP (回溯)**: 用户表示"懂了"或"下一步" -> 将当前 Active 层移除，提取核心结论写入 [Knowledge Cache]，将 Active 指针上移一层。
3. **输出格式**:
   - 首先：用自然语言回答用户问题，解释概念。
   - 最后：必须输出一个且仅一个 markdown 代码块，包含更新后的完整文档状态。

**文档格式模版**:
# 🎯 Goal: [终极目标]

## 🥞 Stack (递归栈)
1. [Level 0] Root Topic
2. [Level 1] Sub-topic (Active)

## 🧠 Cache (已归档知识)
- [Level 2] Concept: Definition...

---
现在，根据用户的输入和当前的文档状态，执行操作并更新文档。
`;

const INITIAL_DOC_TEMPLATE = (goal) => `# 🎯 Goal: ${goal}

## 🥞 Stack (递归栈)
1. [Level 0] ${goal} (Active)

## 🧠 Cache (已归档知识)
- (暂无归档)
`;

export default function RecursiveLearningAgent() {
  const [apiKey, setApiKey] = useState('');
  const [goal, setGoal] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stackDoc, setStackDoc] = useState('');
  const [showSettings, setShowSettings] = useState(true);
  
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial Setup
  const handleStart = () => {
    if (!goal.trim()) return;
    setStackDoc(INITIAL_DOC_TEMPLATE(goal));
    setIsStarted(true);
    addMessage('system', `递归学习系统已启动。目标设定为: ${goal}。请提出你的第一个问题，或者让我为你拆解这个主题。`);
  };

  const addMessage = (role, text) => {
    setMessages(prev => [...prev, { role, text }]);
  };

  // --- API Interaction Logic ---
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    if (!apiKey) {
      alert("请先在设置中输入 Google Gemini API Key");
      setShowSettings(true);
      return;
    }

    const userMsg = input;
    setInput('');
    addMessage('user', userMsg);
    setIsLoading(true);

    try {
      // Construct the prompt combining Context + Input
      const fullPrompt = `
${SYSTEM_PROMPT}

**当前文档状态 (CURRENT STATE):**
${stackDoc}

**用户输入 (USER INPUT):**
${userMsg}
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }]
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
      
      // Parse Output: Separate Chat vs Markdown
      const markdownMatch = aiText.match(/```markdown([\s\S]*?)```/);
      let newDoc = stackDoc;
      let chatResponse = aiText;

      if (markdownMatch) {
        newDoc = markdownMatch[1].trim();
        // Remove the markdown block from the chat display to keep it clean
        chatResponse = aiText.replace(/```markdown[\s\S]*?```/, '').trim();
      }

      setStackDoc(newDoc);
      addMessage('assistant', chatResponse);

    } catch (error) {
      addMessage('system', `Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI Components ---

  const renderStackVisualizer = (doc) => {
    // Simple parser to visualize the stack from markdown
    const lines = doc.split('\n');
    let section = '';
    const stackItems = [];
    const cacheItems = [];
    let goalText = '';

    lines.forEach(line => {
      if (line.startsWith('# 🎯')) goalText = line.replace('# 🎯 Goal:', '').trim();
      else if (line.startsWith('## 🥞')) section = 'stack';
      else if (line.startsWith('## 🧠')) section = 'cache';
      else if (line.trim().match(/^\d+\./) && section === 'stack') {
        stackItems.push(line.trim());
      }
      else if (line.trim().startsWith('-') && section === 'cache') {
        cacheItems.push(line.replace('-', '').trim());
      }
    });

    return (
      <div className="space-y-6">
        {/* Goal */}
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
          <div className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Root Goal</div>
          <div className="text-lg font-semibold text-emerald-400">{goalText || "Not set"}</div>
        </div>

        {/* The Stack */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-slate-300">
            <Layers size={18} />
            <span className="font-bold text-sm uppercase tracking-wider">Recursive Stack</span>
          </div>
          <div className="space-y-2">
            {stackItems.length === 0 ? <div className="text-slate-600 italic">Empty stack</div> : 
             stackItems.map((item, idx) => {
               const isActive = item.includes('(Active)');
               const cleanText = item.replace('(Active)', '').replace(/^\[.*?\]/, '').replace(/^\d+\./, '').trim();
               // Extract level if present
               const levelMatch = item.match(/\[Level (\d+)\]/);
               const level = levelMatch ? parseInt(levelMatch[1]) : 0;
               
               return (
                 <div key={idx} 
                      className={`relative p-3 rounded-md transition-all duration-300 ${isActive ? 'bg-indigo-900/50 border-l-4 border-indigo-400 shadow-lg translate-x-2' : 'bg-slate-800/50 border-l-4 border-slate-600 opacity-60'}`}
                      style={{ marginLeft: `${level * 12}px` }}
                 >
                   <div className="flex justify-between items-center">
                     <span className="font-mono text-sm">{cleanText}</span>
                     {isActive && <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full animate-pulse">CURRENT</span>}
                   </div>
                 </div>
               );
             })}
          </div>
        </div>

        {/* The Cache */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-slate-300 mt-8">
            <Database size={18} />
            <span className="font-bold text-sm uppercase tracking-wider">Knowledge Cache</span>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 max-h-60 overflow-y-auto">
            {cacheItems.length === 0 || cacheItems[0] === '(暂无归档)' ? 
              <div className="text-slate-600 italic text-sm">Completed concepts will appear here...</div> :
              <ul className="space-y-2">
                {cacheItems.map((item, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-slate-400">
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            }
          </div>
        </div>
      </div>
    );
  };

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 p-8 rounded-xl border border-slate-800 shadow-2xl">
          <div className="flex items-center gap-3 mb-6 text-indigo-400">
            <RotateCcw size={32} />
            <h1 className="text-2xl font-bold">Recursive Learner</h1>
          </div>
          <p className="text-slate-400 mb-6 text-sm">
            一个基于 Stack-Doc 协议的极简 Agent。防止你在深度学习中迷失方向。
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Google Gemini API Key</label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste key here..."
                className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-sm focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">你想学什么？(Root Goal)</label>
              <input 
                type="text" 
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Transformer Architecture, Quantum Mechanics..."
                className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-sm focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>
            <button 
              onClick={handleStart}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 mt-4"
            >
              <Play size={18} /> 初始化 Stack
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-200 flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* LEFT: Chat Interface (Execution) */}
      <div className="flex-1 flex flex-col h-full border-r border-slate-800 relative">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <h2 className="font-bold flex items-center gap-2">
            <CornerDownLeft size={18} className="text-indigo-400"/> 
            Execution Stream
          </h2>
          <button onClick={() => setShowSettings(!showSettings)} className="text-slate-500 hover:text-slate-300">
            <Settings size={18} />
          </button>
        </div>

        {showSettings && (
          <div className="absolute top-16 left-4 right-4 bg-slate-900 border border-slate-700 p-4 rounded-lg z-20 shadow-xl">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">API Key</label>
             <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs mb-2"
              />
              <button onClick={() => setShowSettings(false)} className="text-xs text-indigo-400 hover:underline">Close</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg p-3 text-sm leading-relaxed ${
                msg.role === 'user' ? 'bg-indigo-600 text-white' : 
                msg.role === 'system' ? 'bg-slate-800 text-yellow-400 font-mono text-xs border border-yellow-400/20' :
                'bg-slate-800 text-slate-200'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 rounded-lg p-3 text-sm text-slate-400 flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                <span className="text-xs">Updating Stack...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <div className="flex gap-2 relative">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question or say 'I understand'..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg pl-4 pr-12 py-3 focus:border-indigo-500 focus:outline-none text-sm"
            />
            <button 
              onClick={handleSend}
              disabled={isLoading}
              className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white p-2 rounded transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
          <div className="text-[10px] text-slate-600 mt-2 text-center">
            Tip: Ask "What is X?" to Push. Say "I understand" to Pop.
          </div>
        </div>
      </div>

      {/* RIGHT: Stack-Doc (State) */}
      <div className="w-full md:w-[450px] bg-slate-950 flex flex-col h-full border-l border-slate-800">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <h2 className="font-bold flex items-center gap-2 text-emerald-400">
            <Database size={18} />
            Stack-Doc (Memory)
          </h2>
          <div className="flex gap-2">
            <button className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-400 flex items-center gap-1" onClick={() => navigator.clipboard.writeText(stackDoc)}>
              <Save size={12} /> Copy
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700">
           {/* Visualizer View */}
           {renderStackVisualizer(stackDoc)}

           {/* Raw View Toggle (Hidden by default, useful for debugging) */}
           <div className="mt-12 pt-6 border-t border-slate-800/50">
             <div className="text-[10px] uppercase font-bold text-slate-600 mb-2">Raw State (Debug)</div>
             <pre className="text-[10px] text-slate-600 font-mono whitespace-pre-wrap leading-tight select-all cursor-text">
               {stackDoc}
             </pre>
           </div>
        </div>
      </div>

    </div>
  );
}