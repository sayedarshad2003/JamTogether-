import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Smile } from 'lucide-react';
import { ChatMessage, RoomMember, UserProfile } from '../types/jam.ts';

interface LiveChatPanelProps {
  messages: ChatMessage[];
  members: RoomMember[];
  currentUser: UserProfile | null;
  onSendMessage: (content: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
}

const QUICK_REACTIONS = ['🔥', '🎧', '💜', '👏', '🚀'];

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function LiveChatPanel({
  messages,
  members,
  currentUser,
  onSendMessage,
  onToggleReaction,
}: LiveChatPanelProps) {
  const [input, setInput] = useState('');
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const onlineCount = members.filter((m) => m.isOnline).length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    await onSendMessage(trimmed);
  };

  return (
    <div className="flex flex-col h-full rounded-2xl bg-white dark:bg-[#11131C] border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Live Room Chat</h3>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          {onlineCount} online
        </span>
      </div>

      {/* Messages Viewport */}
      <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
        {messages.map((msg) => {
          const isSystem = msg.type === 'system';
          if (isSystem) {
            return (
              <div
                key={msg.messageId}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#181B28] text-[11px] text-slate-600 dark:text-slate-400 text-center"
              >
                {msg.content}
              </div>
            );
          }

          return (
            <div key={msg.messageId} className="group flex items-start gap-2.5">
              <img
                src={msg.avatarUrl || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(msg.displayName || msg.username || 'user')}`}
                alt={msg.displayName}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(msg.displayName || msg.username || 'user')}`;
                }}
                className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {msg.displayName}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                    {formatTimestamp(msg.timestamp)}
                  </span>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed break-words">
                  {msg.content}
                </p>

                {/* Emoji Reactions Row */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {Object.entries(msg.reactions || {}).map(([emoji, userIds]) => {
                    const hasReacted = currentUser ? userIds.includes(currentUser.userId) : false;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => onToggleReaction(msg.messageId, emoji)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono transition-colors ${
                          hasReacted
                            ? 'bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-500/40'
                            : 'bg-slate-100 dark:bg-[#181B28] text-slate-600 dark:text-slate-400 border border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span>{userIds.length}</span>
                      </button>
                    );
                  })}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveReactionMsgId((prev) =>
                          prev === msg.messageId ? null : msg.messageId
                        )
                      }
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-opacity"
                      title="Add reaction"
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>

                    {activeReactionMsgId === msg.messageId && (
                      <div className="absolute left-0 bottom-full mb-1 z-20 flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 shadow-lg">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              onToggleReaction(msg.messageId, emoji);
                              setActiveReactionMsgId(null);
                            }}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs transition-transform hover:scale-110"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Chat Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#181B28]/40 shrink-0"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the room..."
            className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-[#181B28] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-2 rounded-xl text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-40 transition-all shrink-0"
            aria-label="Send chat message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
