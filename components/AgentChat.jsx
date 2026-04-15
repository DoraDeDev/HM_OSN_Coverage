// components/AgentChat.jsx
import { useState, useRef, useEffect } from 'react';

const styles = {
  container: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    width: '340px',
    zIndex: 20,
    animation: 'fadeIn 0.2s ease',
  },
  chatBox: {
    background: 'rgba(20,23,32,0.96)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    overflow: 'hidden',
    marginTop: '8px',
    maxHeight: '240px',
    display: 'flex',
    flexDirection: 'column',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  msg: {
    fontSize: '12px',
    lineHeight: '1.5',
    padding: '7px 10px',
    borderRadius: '8px',
    maxWidth: '90%',
    animation: 'fadeIn 0.15s ease',
  },
  userMsg: {
    background: 'rgba(79,142,247,0.15)',
    color: 'var(--text)',
    alignSelf: 'flex-end',
    borderBottomRightRadius: '3px',
  },
  assistantMsg: {
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--text2)',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: '3px',
  },
  filterUpdate: {
    background: 'rgba(52,211,153,0.08)',
    border: '1px solid rgba(52,211,153,0.15)',
    color: '#34d399',
    fontSize: '11px',
    padding: '5px 10px',
    borderRadius: '8px',
    alignSelf: 'flex-start',
  },
  inputRow: {
    display: 'flex',
    gap: '6px',
    padding: '8px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '7px 10px',
    color: 'var(--text)',
    fontSize: '12px',
    fontFamily: 'var(--font)',
    outline: 'none',
  },
  sendBtn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    padding: '7px 12px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'var(--font)',
    transition: 'opacity 0.1s',
    flexShrink: 0,
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(20,23,32,0.92)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px',
    padding: '6px 14px',
    color: 'var(--text2)',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s',
  },
  dot: {
    width: '6px', height: '6px',
    borderRadius: '50%',
    background: 'var(--accent)',
    animation: 'pulse 2s ease infinite',
  },
  suggestions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    padding: '0 8px 6px',
  },
  suggestion: {
    fontSize: '10px',
    padding: '3px 8px',
    background: 'rgba(79,142,247,0.1)',
    border: '1px solid rgba(79,142,247,0.2)',
    borderRadius: '20px',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.1s',
  },
};

const SUGGESTIONS = [
  'Show Florida listings',
  'Compare FL and TX coverage',
  'Only active listings',
  'Show single family homes',
  'Which OSN has best coverage?',
];

export default function AgentChat({ onFiltersChange, currentFilters, availableOptions }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Ask me to filter by state, status, property type, or analyze OSN coverage.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const send = async (text) => {
    const message = text || input.trim();
    if (!message) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: message }]);
    setLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          currentFilters,
          availableOptions,
        }),
      });
      const data = await res.json();

      setMessages(prev => [...prev, { role: 'assistant', text: data.message || 'Done.' }]);

      if (data.action === 'update_filters' && data.filters) {
        onFiltersChange(data.filters);
        setMessages(prev => [...prev, {
          role: 'filter',
          text: `✓ Filters updated — click "Load Map Data" to apply`,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Request failed. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={styles.container}>
      <button
        style={styles.toggleBtn}
        onClick={() => setOpen(o => !o)}
      >
        <div style={styles.dot} />
        AI Filter Assistant
        <span style={{ fontSize: '10px', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={styles.chatBox}>
          <div style={styles.messagesArea}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  ...styles.msg,
                  ...(msg.role === 'user' ? styles.userMsg :
                    msg.role === 'filter' ? styles.filterUpdate :
                    styles.assistantMsg),
                }}
              >
                {msg.text}
              </div>
            ))}
            {loading && (
              <div style={{ ...styles.msg, ...styles.assistantMsg, opacity: 0.5 }}>
                Thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length === 1 && (
            <div style={styles.suggestions}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  style={styles.suggestion}
                  onClick={() => send(s)}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(79,142,247,0.1)'}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div style={styles.inputRow}>
            <input
              style={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about listings, coverage, filters…"
              disabled={loading}
            />
            <button
              style={{ ...styles.sendBtn, opacity: loading || !input.trim() ? 0.4 : 1 }}
              onClick={() => send()}
              disabled={loading || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
