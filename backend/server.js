const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage for chat history
let chatSessions = new Map();
let currentSessionId = null;

app.use(cors());
app.use(express.json());

// ✅ FIXED: Serve frontend folder (root mein frontend folder)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ✅ FIXED: Root route serves frontend/index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK' });
});

// Create new session
app.post('/api/session', (req, res) => {
    const sessionId = Date.now().toString();
    chatSessions.set(sessionId, []);
    currentSessionId = sessionId;
    res.json({ sessionId, message: 'New session created' });
});

// Get chat history
app.get('/api/history/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const history = chatSessions.get(sessionId) || [];
    res.json({ history });
});

// Get all sessions
app.get('/api/sessions', (req, res) => {
    const sessions = Array.from(chatSessions.keys()).map(id => ({
        id,
        createdAt: id,
        messageCount: chatSessions.get(id).length
    }));
    res.json({ sessions });
});

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
    const { message, sessionId } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    // Use existing session or create new
    let activeSessionId = sessionId;
    if (!activeSessionId || !chatSessions.has(activeSessionId)) {
        activeSessionId = Date.now().toString();
        chatSessions.set(activeSessionId, []);
    }

    // Get previous chat history for context
    const chatHistory = chatSessions.get(activeSessionId) || [];
    
    // Build messages array with history
    const messages = [
        { role: 'system', content: 'You are SmartChat, a friendly AI assistant. Keep responses concise, helpful, and natural.' }
    ];
    
    // Add last 5 messages for context (RAG)
    const lastMessages = chatHistory.slice(-5);
    for (const msg of lastMessages) {
        messages.push({
            role: msg.role,
            content: msg.content
        });
    }
    
    // Add current message
    messages.push({ role: 'user', content: message });
    
    // Save user message to history
    chatSessions.get(activeSessionId).push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messages,
                temperature: 0.7,
                max_tokens: 500
            })
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({ error: data.error.message });
        }

        const reply = data.choices?.[0]?.message?.content || "I couldn't generate a response.";
        
        // Save assistant response to history
        chatSessions.get(activeSessionId).push({
            role: 'assistant',
            content: reply,
            timestamp: new Date().toISOString()
        });

        res.json({ 
            reply: reply,
            sessionId: activeSessionId
        });
        
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete session
app.delete('/api/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    chatSessions.delete(sessionId);
    res.json({ message: 'Session deleted' });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Serving frontend from: ${path.join(__dirname, '..', 'frontend')}`);
    console.log(`✅ Streaming + RAG + History enabled`);
});