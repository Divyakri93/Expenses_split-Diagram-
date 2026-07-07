import React, { useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import { Send, FileText } from 'lucide-react';

const ChatView = ({ groupId }) => {
    const { user } = useContext(AuthContext);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [socket, setSocket] = useState(null);
    const messagesEndRef = useRef(null);

    // Initialize Socket and Fetch History
    useEffect(() => {
        if (!groupId) return;

        // Fetch history
        const fetchHistory = async () => {
            try {
                const res = await axios.get(`/api/messages/${groupId}`);
                setMessages(res.data.messages);
                scrollToBottom();
            } catch (err) {
                console.error("Failed to fetch messages:", err);
            }
        };

        fetchHistory();

        // Connect Socket
        let socketUrl = import.meta.env.VITE_API_URL || '';
        if (socketUrl.endsWith('/')) socketUrl = socketUrl.slice(0, -1);
        const newSocket = io(socketUrl);

        newSocket.on('connect', () => {
            newSocket.emit('join_group', groupId);
        });

        newSocket.on('new_message', (msg) => {
            setMessages((prev) => [...prev, msg]);
            scrollToBottom();
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [groupId]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        const content = inputText;
        setInputText(''); // optimistic clear

        try {
            await axios.post(`/api/messages/${groupId}`, { content });
        } catch (err) {
            console.error("Failed to send message", err);
        }
    };

    return (
        <div className="flex flex-col h-[70vh] bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        No activity yet. Send a message or log an expense!
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isSystem = msg.message_type === 'system_expense';
                        const isMine = msg.user_id === user.id;

                        if (isSystem) {
                            return (
                                <div key={msg.id || idx} className="flex justify-center my-4">
                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium px-4 py-3 rounded-2xl shadow-sm flex items-start whitespace-pre-wrap max-w-[80%]">
                                        <FileText className="w-4 h-4 mr-2 text-amber-600 mt-0.5 flex-shrink-0" />
                                        <span>{msg.content}</span>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={msg.id || idx} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                <div className={`flex items-end gap-2 max-w-[70%] ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                                        {msg.Sender?.name?.charAt(0) || '?'}
                                    </div>
                                    <div className={`px-4 py-3 rounded-2xl shadow-sm ${isMine ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-slate-900 border border-slate-100 rounded-bl-none'}`}>
                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                                <span className="text-[10px] text-slate-400 mt-1 mx-10">
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white border-t border-slate-200 p-4">
                <form onSubmit={handleSendMessage} className="flex gap-3">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 rounded-full border border-slate-300 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 text-sm"
                    />
                    <button type="submit" disabled={!inputText.trim()} className="bg-indigo-600 text-white p-3 rounded-full hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                        <Send className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatView;
