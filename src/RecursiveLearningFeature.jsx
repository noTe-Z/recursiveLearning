import React, { useState, useEffect, useRef } from 'react';
import { Send, Layers, RotateCcw, Save, Play, Settings, CornerDownLeft, Database, CheckCircle2 } from 'lucide-react';

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
      } else if (line.trim().startsWith('-') && section === 'cache') {
        cacheItems.push(line.replace('-', '').trim());
      }
    });

    return (
      <div className="stack-visual">
        <div className="goal-card">
          <div className="goal-label">Root Goal</div>
          <div className="goal-text">{goalText || 'Not set'}</div>
        </div>

        <div className="section">
          <div className="section-title">
            <Layers size={16} />
            <span>Recursive Stack</span>
          </div>
          <div className="stack-list">
            {stackItems.length === 0 ? (
              <div className="cache-empty">Empty stack</div>
            ) : (
              stackItems.map((item, idx) => {
                const isActive = item.includes('(Active)');
                const cleanText = item
                  .replace('(Active)', '')
                  .replace(/^\[.*?\]/, '')
                  .replace(/^\d+\./, '')
                  .trim();
                const levelMatch = item.match(/\[Level (\d+)\]/);
                const level = levelMatch ? parseInt(levelMatch[1]) : 0;

                return (
                  <div
                    key={idx}
                    className={`stack-item ${isActive ? 'active' : ''}`}
                    style={{ marginLeft: `${level * 12}px` }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{cleanText}</span>
                      {isActive && <span className="badge">CURRENT</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-title">
            <Database size={16} />
            <span>Knowledge Cache</span>
          </div>
          <div className="cache-card">
            {cacheItems.length === 0 || cacheItems[0] === '(暂无归档)' ? (
              <div className="cache-empty">Completed concepts will appear here...</div>
            ) : (
              <ul className="cache-list">
                {cacheItems.map((item, idx) => (
                  <li key={idx} className="cache-item">
                    <CheckCircle2 size={16} color="#70efc9" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!isStarted) {
    return (
      <div className="start-shell">
        <div className="start-card">
          <div className="start-header">
            <RotateCcw size={30} className="brand-icon" />
            <div>
              <div className="start-badge">Execution Stream</div>
              <h1 className="start-title">Recursive Learner</h1>
            </div>
          </div>
          <p className="muted">一个基于 Stack-Doc 协议的极简 Agent。防止你在深度学习中迷失方向。</p>

          <div className="form-group">
            <label className="form-label">Google Gemini API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste key here..."
              className="text-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">你想学什么？（Root Goal）</label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Transformer Architecture, Quantum Mechanics..."
              className="text-input"
            />
          </div>

          <button onClick={handleStart} className="primary-btn">
            <Play size={18} /> 初始化 Stack
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="execution-panel">
        <div className="panel-header">
          <div className="panel-title">
            <CornerDownLeft size={18} />
            <span>Execution Stream</span>
          </div>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={18} />
          </button>
        </div>

        {showSettings && (
          <div className="settings-card">
            <label className="form-label">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="text-input"
              placeholder="Paste key here..."
            />
            <button className="link-btn" onClick={() => setShowSettings(false)}>Close</button>
          </div>
        )}

        <div className="messages">
          {messages.map((msg, i) => (
            <div key={i} className="message-row" style={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`message ${msg.role}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-row">
              <div className="message assistant">
                <div className="loader">
                  <div className="dot" />
                  <div className="dot" />
                  <div className="dot" />
                  <span>Updating Stack...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-bar">
          <div className="chat-input-wrap">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question or say 'I understand'..."
              className="chat-input"
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              className="send-btn"
            >
              <Send size={16} />
            </button>
          </div>
          <div className="helper">
            Tip: Ask "What is X?" to Push. Say "I understand" to Pop.
          </div>
        </div>
      </div>

      <div className="stack-panel">
        <div className="panel-header">
          <div className="panel-title" style={{ color: '#70efc9' }}>
            <Database size={18} />
            <span>Stack-Doc (Memory)</span>
          </div>
          <button className="ghost-btn" onClick={() => navigator.clipboard.writeText(stackDoc)}>
            <Save size={14} /> Copy
          </button>
        </div>

        <div className="stack-body">
          {renderStackVisualizer(stackDoc)}
          <div className="raw-section">
            <div className="raw-label">Raw State (Debug)</div>
            <pre className="raw-pre">
              {stackDoc}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}