import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, MessageSquare, AlertCircle,
  Copy, Check, ChevronDown, ChevronUp, Sparkles, BookOpen,
} from 'lucide-react';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const SUGGESTED = [
  'What is the company\'s total revenue and net profit?',
  'Summarize the key financial highlights',
  'What are the main risk factors mentioned?',
  'What is the debt-to-equity ratio?',
  'Who are the promoters and what is their background?',
  'What collateral or security is offered for the loan?',
];

/** Render a plain-text answer with basic markdown: bold, bullets, numbered lists */
function AnswerText({ text, streaming }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        // Numbered list: "1. ..."
        const numbered = line.match(/^(\d+)\.\s+(.*)/);
        if (numbered) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-blue-500 font-semibold shrink-0 w-5">{numbered[1]}.</span>
              <span>{renderInline(numbered[2])}</span>
            </div>
          );
        }
        // Bullet list: "- ..." or "* ..."
        const bullet = line.match(/^[-*•]\s+(.*)/);
        if (bullet) {
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-blue-400 shrink-0 mt-1">•</span>
              <span>{renderInline(bullet[1])}</span>
            </div>
          );
        }
        // Heading: "## ..."
        const heading = line.match(/^#{1,3}\s+(.*)/);
        if (heading) {
          return <p key={i} className="font-semibold text-slate-800 mt-2">{heading[1]}</p>;
        }
        return <p key={i}>{renderInline(line)}</p>;
      })}
      {streaming && (
        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-middle" />
      )}
    </div>
  );
}

function renderInline(text) {
  // **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-slate-800">{p.slice(2, -2)}</strong>
      : p
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handle}
      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      title="Copy answer"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors font-medium"
      >
        <BookOpen className="w-3.5 h-3.5" />
        {sources.length} source{sources.length > 1 ? 's' : ''} referenced
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 max-h-52 overflow-y-auto pr-1">
          {sources.map((s, j) => (
            <li key={j} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
              {s.section && (
                <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide block mb-1">
                  {s.section}
                </span>
              )}
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                {s.text || (typeof s === 'string' ? s : JSON.stringify(s))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DocQuery() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (questionOverride) => {
    const question = (questionOverride || input).trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);

    // Add a placeholder assistant message we'll stream into
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', text: '', sources: [], streaming: true },
    ]);

    try {
      const res = await fetch(`${BASE_URL}/query/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, top_k: 5 }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === 'sources') {
            setMessages((prev) => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], sources: event.content };
              return msgs;
            });
          } else if (event.type === 'token') {
            setMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              msgs[msgs.length - 1] = { ...last, text: last.text + event.content };
              return msgs;
            });
          } else if (event.type === 'error') {
            setMessages((prev) => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { role: 'error', text: event.content, streaming: false };
              return msgs;
            });
          } else if (event.type === 'done') {
            setMessages((prev) => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], streaming: false };
              return msgs;
            });
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const msgs = [...prev];
        // Replace the last placeholder with an error
        msgs[msgs.length - 1] = { role: 'error', text: err.message || 'Something went wrong.', streaming: false };
        return msgs;
      });
    } finally {
      setLoading(false);
    }
}, [input, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Document Q&amp;A
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Ask questions about all uploaded financial documents — answers stream in real time
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 bg-slate-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 pb-8">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-blue-500" />
              </div>
              <p className="text-sm font-semibold text-slate-600 mt-1">Ask anything about your documents</p>
              <p className="text-xs text-slate-400 max-w-xs text-center">
                Answers are grounded in the uploaded financials and stream in real time.
              </p>
            </div>
            {/* Suggested questions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGGESTED.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="text-left px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 text-xs text-slate-600 hover:text-blue-700 transition-colors shadow-sm disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[72%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm">
                    {msg.text}
                  </div>
                ) : msg.role === 'error' ? (
                  <div className="max-w-[80%] bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 shadow-sm">
                    <div className="flex items-center gap-1.5 text-red-500 text-xs font-semibold mb-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Error
                    </div>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                ) : (
                  <div className="max-w-[80%] bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-700 shadow-sm">
                    {/* Toolbar */}
                    {!msg.streaming && msg.text && (
                      <div className="flex justify-end mb-1">
                        <CopyButton text={msg.text} />
                      </div>
                    )}
                    {msg.text ? (
                      <AnswerText text={msg.text} streaming={msg.streaming} />
                    ) : (
                      <span className="flex items-center gap-2 text-slate-400 text-xs">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                    <SourcesPanel sources={msg.sources} />
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-6 py-3 bg-white border-t border-slate-200 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the documents…"
            className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 overflow-hidden"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="p-2.5 mb-0.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
