const http = require('http');
const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');
const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, Browsers } = baileys;
const pino = require('pino');
const cron = require('node-cron');

const AUTH_DIR = path.join(__dirname, 'auth_info');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default Settings (Koi hardcoded API key nahi hai - 100% GitHub Safe)
let settings = {
    geminiApiKey: '',
    geminiModel: 'auto', // Apne aap best working model dhundh lega
    phoneNumber: '919369249280',
    groupName: 'Arpit',
    aiNature: 'Tum ek experienced Class 10 Board Exam (UP Board / CBSE) Computer Science teacher ho. Hamesha simple, clear Hindi/Hinglish mein samjhao. Sirf wahi important Computer questions aur topics bhejo jo board paper mein baar-baar puche jate hain. WhatsApp formatting (*bold*, bullet points) use karo aur faltu lambi baatein mat likho.',
    autoEnabled: true,
    time1: '08:00',
    time2: '18:00',
    count: 1,
    computerChapter: 'Mix (Complete Class 10 Computer Board Syllabus)',
    contentType: 'Important Board Topic'
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            settings = { ...settings, ...saved };
        }
    } catch (e) {
        console.log('Config load error:', e.message);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.log('Config save error:', e.message);
    }
}

function getActiveApiKey() {
    const raw = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
    return raw.trim().replace(/^["']|["']$/g, '');
}

loadConfig();

// Bot State
let globalSock = null;
let reconnectTimer = null;
let botStatus = 'Starting...';
let latestQR = '';
let latestPairingCode = '';
let wantPairingCode = false;
let isLinked = false;
let cronStarted = false;
let lastCronMinute = '';
let availableGroups = [];
let detectedWorkingModel = '';
const activityLogs = [];

function addLog(msg) {
    const time = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const entry = `[${time}] ${msg}`;
    console.log(entry);
    activityLogs.unshift(entry);
    if (activityLogs.length > 35) activityLogs.pop();
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clearSession() {
    try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch (e) {}
}

function stopCurrentSocket() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (globalSock) {
        try {
            globalSock.ev.removeAllListeners('connection.update');
            globalSock.ev.removeAllListeners('creds.update');
            globalSock.end();
        } catch (e) {}
        globalSock = null;
    }
}

function restartBot(delayMs = 2000) {
    stopCurrentSocket();
    reconnectTimer = setTimeout(() => {
        startBot();
    }, delayMs);
}

async function refreshGroups() {
    if (!globalSock || !isLinked) return;
    try {
        const groups = await globalSock.groupFetchAllParticipating();
        availableGroups = Object.values(groups)
            .map(g => g.subject)
            .filter(Boolean);
    } catch (e) {}
}

async function sendToGroup(text) {
    if (!globalSock || !isLinked) throw new Error('Bot abhi WhatsApp se connect nahi hai!');
    const groups = await globalSock.groupFetchAllParticipating();
    availableGroups = Object.values(groups).map(g => g.subject).filter(Boolean);

    const targetGroup = Object.values(groups).find(
        (g) => g.subject && g.subject.trim().toLowerCase() === settings.groupName.trim().toLowerCase()
    );
    if (!targetGroup) {
        throw new Error(`Group "${settings.groupName}" nahi mila! Available groups: ${availableGroups.join(', ') || 'None'}`);
    }
    await globalSock.sendMessage(targetGroup.id, { text });
}

// Auto-Detect Working Gemini Model (No 404 Error)
function scoreModel(name) {
    const n = name.toLowerCase();
    if (!n.includes('gemini')) return -100;
    if (n.includes('embedding') || n.includes('imagen') || n.includes('veo') || n.includes('tts') || n.includes('audio') || n.includes('image') || n.includes('robotics') || n.includes('computer-use') || n.includes('aqa')) {
        return -500;
    }
    let score = 0;
    if (n.includes('flash')) score += 60;
    if (n.includes('3.') || n.includes('gemini-3')) score += 50;
    else if (n.includes('2.5')) score += 35;
    else if (n.includes('2.0')) score += 20;
    else if (n.includes('1.5')) score += 10;
    if (n.includes('lite')) score -= 10;
    if (n.includes('exp')) score -= 15;
    if (n.includes('pro')) score += 5;
    return score;
}

async function fetchWorkingModels(apiKey) {
    const versions = ['v1beta', 'v1'];
    let lastErr = '';

    for (const apiVer of versions) {
        const url = `https://generativelanguage.googleapis.com/${apiVer}/models?key=${encodeURIComponent(apiKey)}&pageSize=100`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            lastErr = data?.error?.message || `HTTP ${res.status}`;
            if (res.status === 400 || res.status === 401 || res.status === 403) {
                throw new Error(`API Key invalid ya blocked hai: ${lastErr}`);
            }
            continue;
        }

        const valid = (data.models || [])
            .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace(/^models\//, ''))
            .filter(name => scoreModel(name) > -100)
            .sort((a, b) => scoreModel(b) - scoreModel(a));

        if (valid.length > 0) {
            return { apiVer, models: valid };
        }
    }

    throw new Error(`Koi working model nahi mila (${lastErr || 'Empty list'})`);
}

async function generateWithAutoGemini(apiKey, prompt, systemInstruction) {
    const { apiVer, models } = await fetchWorkingModels(apiKey);

    // User ne koi specific model likha ho toh pehle try karein, warna auto list use karein
    const candidates = [];
    const customModel = (settings.geminiModel || '').trim();
    if (customModel && customModel.toLowerCase() !== 'auto') {
        candidates.push(customModel.replace(/^models\//, ''));
    }
    if (detectedWorkingModel && !candidates.includes(detectedWorkingModel)) {
        candidates.push(detectedWorkingModel);
    }
    for (const m of models) {
        if (!candidates.includes(m)) candidates.push(m);
    }

    let lastErrorMsg = '';
    const maxTries = Math.min(candidates.length, 6);

    for (let i = 0; i < maxTries; i++) {
        const modelName = candidates[i];
        const endpoint = `https://generativelanguage.googleapis.com/${apiVer}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const bodyPayload = {
            contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\n${prompt}` }] }]
        };

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
        });

        const data = await res.json();

        if (res.ok) {
            const text = data?.candidates?.[0]?.content?.parts
                ?.map(p => p.text || '')
                .join('')
                .trim();

            if (text) {
                if (detectedWorkingModel !== modelName) {
                    detectedWorkingModel = modelName;
                    addLog(`🎯 Auto-detected working model: ${modelName} (${apiVer})`);
                }
                return text;
            }
            lastErrorMsg = `Model ${modelName} ne khali jawab diya.`;
        } else {
            lastErrorMsg = data?.error?.message || `HTTP ${res.status}`;
            addLog(`⚠️ Model ${modelName} skip kiya (${res.status}), agla try kar raha hu...`);
            if (res.status === 401 || res.status === 403) {
                throw new Error(`API Key error: ${lastErrorMsg}`);
            }
        }
    }

    throw new Error(lastErrorMsg || 'Sabhi models fail ho gaye.');
}

// Sirf Class 10 Board Computer AI Generator
async function sendAIContent(chapter, type, count = 1) {
    try {
        const apiKey = getActiveApiKey();
        if (!apiKey) {
            throw new Error('Gemini API Key set nahi hai! Render Environment ya Web Setup mein apni key dalein.');
        }

        addLog(`⏳ Computer AI se ${count} "${type}" (${chapter}) banwa raha hu...`);

        let prompt = '';
        if (type === 'Board MCQ Quiz') {
            prompt = `Class 10 Board Exam Computer Science (Chapter/Topic: ${chapter}) ke ${count} sabse important aur pichle saalo mein puche gaye OMR-style MCQ questions banao.
Format:
💻 *Class 10 Computer Board Quiz*
*Chapter:* ${chapter}

*Q1.* [Board exam question]
A) [Option 1]
B) [Option 2]
C) [Option 3]
D) [Option 4]

(Answer mat likhna, sirf questions aur options dena taaki students reply karein.)`;
        } else if (type === 'Board MCQ Quiz (With Answer)') {
            prompt = `Class 10 Board Exam Computer Science (Chapter/Topic: ${chapter}) ke ${count} most important MCQ questions unke sahi answer aur 1-line explanation ke saath banao.
Format:
💻 *Class 10 Computer Important MCQs*
*Q1.* [Sawal]
A) [Option] | B) [Option] | C) [Option] | D) [Option]
✅ *Answer:* [Sahi option + 1 line reason]`;
        } else if (type === 'Important Board Topic') {
            prompt = `Class 10 Board Exam Computer Science (Chapter/Topic: ${chapter}) ka ${count} sabse zaroori aur board paper mein aksar pucha jane wala topic select karo aur padhne ke liye clear notes do.
Format:
📖 *Class 10 Computer - Important Board Topic*
*Topic:* [Topic ka naam]
*Board Exam Mein Kaise Pucha Jata Hai:* [1 line]
*Asaan Explanation:* [Bullet points mein main points aur example]
*Exam Tip:* [Marks pakke karne ki tip]`;
        } else if (type === 'Short Q&A (2-4 Marks)') {
            prompt = `Class 10 Board Exam Computer Science (Chapter/Topic: ${chapter}) ke ${count} bahut important Short Answer Questions (2 se 4 marks wale) aur unke exact board-exam style answers likho.`;
        } else if (type === 'Long Question + Answer') {
            prompt = `Class 10 Board Exam Computer Science (Chapter/Topic: ${chapter}) ka ${count} important Long Question (5-6 marks wala) aur uska point-wise complete answer likho.`;
        } else if (type === 'C Program / Coding Question') {
            prompt = `Class 10 Board Exam Computer Science ke ${count} important C Programming question (ya HTML/Logic Gate problem agar relevant ho) do, uska chhota aur bilkul sahi code/solution aur output samjhao.`;
        }

        const aiText = await generateWithAutoGemini(apiKey, prompt, settings.aiNature);
        await sendToGroup(aiText);
        addLog(`✅ ${count} ${type} "${settings.groupName}" group mein bhej diya gaya!`);
    } catch (err) {
        addLog(`❌ AI/Send Error: ${err.message || err}`);
    }
}

const COMPUTER_CHAPTERS = [
    'Mix (Complete Class 10 Computer Board Syllabus)',
    'C Programming (Variables, Loops, Arrays, Strings, Functions)',
    'Networking, Internet, Protocols & Communication',
    'Binary Arithmetic, Number System & Logic Gates',
    'Linux & Operating System Basics',
    'Cyber Security, E-Governance, AI & Cloud Computing',
    'HTML, Web Design & DBMS (Database)'
];

const CONTENT_TYPES = [
    { val: 'Important Board Topic', label: '📖 Important Board Topic (Notes)' },
    { val: 'Board MCQ Quiz', label: '📝 Board MCQ Quiz (Bina Answer)' },
    { val: 'Board MCQ Quiz (With Answer)', label: '✅ Board MCQ Quiz (With Answer)' },
    { val: 'Short Q&A (2-4 Marks)', label: '❓ Short Q&A (2-4 Marks)' },
    { val: 'Long Question + Answer', label: '📄 Long Board Q&A' },
    { val: 'C Program / Coding Question', label: '💻 C Program / Practical Question' }
];

// Web Dashboard HTML
function getDashboardHTML() {
    const hasKey = Boolean(getActiveApiKey());
    const keySource = settings.geminiApiKey ? 'Web Setup' : (process.env.GEMINI_API_KEY ? 'Render Env' : 'Not Set');

    const chapterOptions = COMPUTER_CHAPTERS.map(
        c => `<option value="${escapeHtml(c)}" ${settings.computerChapter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
    ).join('');

    const typeOptions = CONTENT_TYPES.map(
        t => `<option value="${escapeHtml(t.val)}" ${settings.contentType === t.val ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
    ).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Class 10 Computer Board Bot</title>
    <style>
        body { font-family: sans-serif; background: #f0f2f5; margin: 0; padding: 14px; color: #222; }
        .card { background: #fff; padding: 15px; border-radius: 10px; margin-bottom: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.08); }
        h2, h3 { margin-top: 0; color: #075e54; }
        label { font-size: 13px; font-weight: bold; display: block; margin-top: 10px; color: #444; }
        .hint { font-size: 12px; color: #666; margin-top: 4px; }
        .status { font-weight: bold; color: #128c7e; }
        .auth-box { text-align: center; background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 10px 0; border: 1px dashed #ccc; }
        .code { font-size: 26px; font-weight: bold; letter-spacing: 3px; color: #d32f2f; text-align: center; padding: 12px; background: #ffebee; border-radius: 8px; margin: 10px 0; }
        select, textarea, input, button { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box; font-size: 14px; }
        button { background: #25d366; color: white; border: none; font-weight: bold; cursor: pointer; margin-top: 10px; font-size: 15px; }
        button.blue { background: #1976d2; }
        button.orange { background: #f57c00; }
        button.purple { background: #6a1b9a; }
        .row { display: flex; gap: 10px; }
        .row > div { flex: 1; }
        .logs { background: #1e1e1e; color: #00e676; padding: 10px; border-radius: 6px; max-height: 220px; overflow-y: auto; font-family: monospace; font-size: 12px; }
        .log-item { margin-bottom: 5px; border-bottom: 1px solid #333; padding-bottom: 3px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>💻 Class 10 Computer Board Bot</h2>
        <p><b>Status:</b> <span id="status-text" class="status">${escapeHtml(botStatus)}</span></p>
        <p><b>Group:</b> ${escapeHtml(settings.groupName)} | <b>API Key:</b> ${hasKey ? '🟢 Set (' + keySource + ')' : '🔴 Set nahi hai'}</p>
        <p><b>Model:</b> ${escapeHtml(detectedWorkingModel || settings.geminiModel)} | <b>Auto:</b> ${settings.autoEnabled ? '🟢 ON' : '🔴 OFF'} (${escapeHtml(settings.time1)}${settings.time2 ? ' & ' + escapeHtml(settings.time2) : ''})</p>

        <div id="auth-box" class="auth-box" style="${isLinked ? 'display:none;' : ''}">
            <div id="qr-area" style="${wantPairingCode ? 'display:none;' : ''}">
                <p><b>📷 WhatsApp se yeh Live QR Scan karein:</b></p>
                <div id="qr-container">⏳ QR Code load ho raha hai...</div>
            </div>
            <div id="pairing-area" style="${!wantPairingCode ? 'display:none;' : ''}">
                <p><b>🔑 Apna 8-Digit Pairing Code dalein:</b></p>
                <div id="pairing-code-box" class="code">${escapeHtml(latestPairingCode || 'Generating...')}</div>
            </div>

            <form method="POST" action="/get-pairing" style="margin-top:12px;">
                <label style="text-align:left;">WhatsApp Number (91 ke saath):</label>
                <input type="text" name="phone" value="${escapeHtml(settings.phoneNumber)}" required>
                <button type="submit" class="orange">🔑 Pairing Code Banayein</button>
            </form>
            <form method="POST" action="/get-qr">
                <button type="submit" class="blue">📷 Fresh QR Code Dikhayein</button>
            </form>
        </div>
    </div>

    <div class="card">
        <h3>⚙️ Bot Setup (API Key, Model, Group & AI Nature)</h3>
        <form method="POST" action="/save-config">
            <label>Gemini API Key (${hasKey ? '🟢 Active: ' + keySource : '🔴 Required'}):</label>
            <input type="password" name="geminiApiKey" placeholder="${hasKey ? 'Key set hai (badalne ke liye nayi key dalein)' : 'Apni Gemini API Key yahan dalein'}">

            <label>Gemini Model (auto rakhein taaki khud working model chun le):</label>
            <input type="text" name="geminiModel" value="${escapeHtml(settings.geminiModel)}" placeholder="auto" required>

            <label>WhatsApp Group ka Exact Naam:</label>
            <input type="text" name="groupName" value="${escapeHtml(settings.groupName)}" placeholder="Jaise: Arpit" required>
            <div id="groups-hint" class="hint">Connected hone par aapke groups ki list yahan dikhegi...</div>

            <label>AI ka Nature / System Prompt (AI kaise jawab de):</label>
            <textarea name="aiNature" rows="4" required>${escapeHtml(settings.aiNature)}</textarea>

            <button type="submit" class="purple">💾 Settings Save Karein</button>
        </form>
    </div>

    <div class="card">
        <h3>⏰ Auto Computer Study Schedule</h3>
        <form method="POST" action="/save-schedule">
            <div class="row">
                <div>
                    <label>Time 1 (IST):</label>
                    <input type="time" name="time1" value="${escapeHtml(settings.time1)}" required>
                </div>
                <div>
                    <label>Time 2 (IST):</label>
                    <input type="time" name="time2" value="${escapeHtml(settings.time2)}">
                </div>
            </div>
            <label>Auto-Send Mode:</label>
            <select name="autoEnabled">
                <option value="true" ${settings.autoEnabled ? 'selected' : ''}>🟢 ON (Chalu Rakhein)</option>
                <option value="false" ${!settings.autoEnabled ? 'selected' : ''}>🔴 OFF (Band Rakhein)</option>
            </select>
            <label>Computer Chapter / Syllabus:</label>
            <select name="computerChapter">${chapterOptions}</select>
            <div class="row">
                <div>
                    <label>Kya Bhejna Hai:</label>
                    <select name="contentType">${typeOptions}</select>
                </div>
                <div>
                    <label>Kitne Bhejne Hain:</label>
                    <select name="count">
                        <option value="1" ${settings.count == 1 ? 'selected' : ''}>1</option>
                        <option value="2" ${settings.count == 2 ? 'selected' : ''}>2</option>
                        <option value="3" ${settings.count == 3 ? 'selected' : ''}>3</option>
                        <option value="5" ${settings.count == 5 ? 'selected' : ''}>5</option>
                    </select>
                </div>
            </div>
            <button type="submit" class="blue">💾 Computer Schedule Save Karein</button>
        </form>
    </div>

    <div class="card">
        <h3>⚡ Abhi Turant Computer Question / Topic Bhejein</h3>
        <form method="POST" action="/send-ai">
            <label>Computer Chapter:</label>
            <select name="chapter">${chapterOptions}</select>
            <div class="row">
                <div>
                    <label>Type:</label>
                    <select name="type">${typeOptions}</select>
                </div>
                <div>
                    <label>Count:</label>
                    <select name="count">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="5">5</option>
                    </select>
                </div>
            </div>
            <button type="submit">🚀 Abhi Group Mein Bhejein</button>
        </form>
    </div>

    <div class="card">
        <h3>✍️ Apna Custom Message Bhejein</h3>
        <form method="POST" action="/send-custom">
            <textarea name="message" rows="3" placeholder="Apna message yahan likhein..." required></textarea>
            <button type="submit">📤 Custom Message Bhejein</button>
        </form>
    </div>

    <div class="card">
        <h3>📜 Live Activity Logs</h3>
        <div id="logs-box" class="logs">Loading...</div>
    </div>

    <script>
        var lastQrRendered = '';
        function updateLive() {
            fetch('/api/status')
                .then(function(r) { return r.json(); })
                .then(function(d) {
                    document.getElementById('status-text').innerText = d.status;
                    var authBox = document.getElementById('auth-box');
                    if (d.isLinked) {
                        authBox.style.display = 'none';
                    } else {
                        authBox.style.display = 'block';
                        if (d.wantPairingCode) {
                            document.getElementById('qr-area').style.display = 'none';
                            document.getElementById('pairing-area').style.display = 'block';
                            document.getElementById('pairing-code-box').innerText = d.pairingCode || 'Generating...';
                        } else {
                            document.getElementById('qr-area').style.display = 'block';
                            document.getElementById('pairing-area').style.display = 'none';
                            if (d.qr && d.qr !== lastQrRendered) {
                                lastQrRendered = d.qr;
                                var url = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(d.qr);
                                document.getElementById('qr-container').innerHTML = '<img src="' + url + '" style="border:5px solid #fff;border-radius:8px;" />';
                            } else if (!d.qr) {
                                document.getElementById('qr-container').innerText = '⏳ Naya QR Code ban raha hai...';
                            }
                        }
                    }

                    if (d.groups && d.groups.length > 0) {
                        document.getElementById('groups-hint').innerText = 'Available Groups: ' + d.groups.join(' | ');
                    }

                    var logsHtml = d.logs.length
                        ? d.logs.map(function(l) { return '<div class="log-item">' + l.replace(/</g, '&lt;') + '</div>'; }).join('')
                        : '<div class="log-item">Abhi koi activity nahi hai.</div>';
                    document.getElementById('logs-box').innerHTML = logsHtml;
                })
                .catch(function() {});
        }
        updateLive();
        setInterval(updateLive, 3000);
    </script>
</body>
</html>`;
}

// HTTP Server
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(getDashboardHTML());
    }

    if (req.method === 'GET' && req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            status: botStatus,
            isLinked,
            qr: latestQR,
            pairingCode: latestPairingCode,
            wantPairingCode,
            groups: availableGroups,
            logs: activityLogs
        }));
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const params = new URLSearchParams(body);

            if (req.url === '/save-config') {
                const newKey = (params.get('geminiApiKey') || '').trim();
                const newModel = (params.get('geminiModel') || 'auto').trim();
                const newGroup = (params.get('groupName') || '').trim();
                const newNature = (params.get('aiNature') || '').trim();
                if (newKey) {
                    settings.geminiApiKey = newKey;
                    detectedWorkingModel = '';
                }
                settings.geminiModel = newModel || 'auto';
                if (newGroup) settings.groupName = newGroup;
                if (newNature) settings.aiNature = newNature;
                saveConfig();
                addLog(`✅ Config saved! Group: "${settings.groupName}", Model: "${settings.geminiModel}"${newKey ? ' (API Key Updated)' : ''}`);
            } else if (req.url === '/get-pairing') {
                let rawPhone = (params.get('phone') || settings.phoneNumber).replace(/[^0-9]/g, '');
                if (rawPhone.length === 10) rawPhone = '91' + rawPhone;
                settings.phoneNumber = rawPhone;
                saveConfig();
                wantPairingCode = true;
                latestQR = '';
                latestPairingCode = 'Generating...';
                botStatus = `⏳ ${settings.phoneNumber} ke liye Pairing Code ban raha hai...`;
                addLog(`🔄 Fresh Pairing Code request (${settings.phoneNumber})...`);
                clearSession();
                restartBot(500);
            } else if (req.url === '/get-qr') {
                wantPairingCode = false;
                latestQR = '';
                latestPairingCode = '';
                botStatus = '⏳ Fresh QR Code ban raha hai...';
                addLog('🔄 Fresh QR Code request start kiya...');
                clearSession();
                restartBot(500);
            } else if (req.url === '/save-schedule') {
                settings.autoEnabled = params.get('autoEnabled') === 'true';
                settings.time1 = params.get('time1') || '08:00';
                settings.time2 = params.get('time2') || '';
                settings.computerChapter = params.get('computerChapter') || COMPUTER_CHAPTERS[0];
                settings.contentType = params.get('contentType') || 'Important Board Topic';
                settings.count = parseInt(params.get('count') || '1', 10);
                saveConfig();
                addLog(`⚙️ Schedule saved: ${settings.time1} & ${settings.time2} | ${settings.count} ${settings.contentType}`);
            } else if (req.url === '/send-ai') {
                const chapter = params.get('chapter') || settings.computerChapter;
                const type = params.get('type') || 'Important Board Topic';
                const count = parseInt(params.get('count') || '1', 10);
                sendAIContent(chapter, type, count);
            } else if (req.url === '/send-custom') {
                const msg = params.get('message');
                if (msg) {
                    try {
                        await sendToGroup(msg);
                        addLog(`✅ Custom message "${settings.groupName}" mein bheja!`);
                    } catch (err) {
                        addLog(`❌ Custom message error: ${err.message}`);
                    }
                }
            }

            res.writeHead(302, { Location: '/' });
            res.end();
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
}).listen(PORT, () => addLog(`Server running -> Open http://localhost:${PORT}`));

// WhatsApp Bot Start
async function startBot() {
    stopCurrentSocket();
    let pairingRequested = false;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        let version;
        try {
            if (typeof baileys.fetchLatestWaWebVersion === 'function') {
                const live = await baileys.fetchLatestWaWebVersion({});
                if (live && live.version) version = live.version;
            }
            if (!version && typeof baileys.fetchLatestBaileysVersion === 'function') {
                const latest = await baileys.fetchLatestBaileysVersion();
                if (latest && latest.version) version = latest.version;
            }
        } catch (e) {}

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'],
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            markOnlineOnConnect: false
        });

        globalSock = sock;
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            if (sock !== globalSock) return;
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                isLinked = false;
                if (wantPairingCode && !pairingRequested) {
                    pairingRequested = true;
                    setTimeout(async () => {
                        if (sock !== globalSock) return;
                        try {
                            let code = await sock.requestPairingCode(settings.phoneNumber);
                            code = code?.match(/.{1,4}/g)?.join('-') || code;
                            latestPairingCode = code;
                            botStatus = `🔑 Pairing Code Ready (${settings.phoneNumber})`;
                            addLog(`👉 Naya Pairing Code (${settings.phoneNumber}): ${code}`);
                        } catch (err) {
                            latestPairingCode = 'Error! Dobara button dabayein.';
                            addLog(`❌ Pairing Code error: ${err.message}`);
                        }
                    }, 1500);
                } else if (!wantPairingCode) {
                    latestQR = qr;
                    botStatus = '📷 Live QR Ready! Scan karein.';
                }
            }

            if (connection === 'close') {
                isLinked = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                addLog(`⚠️ Connection close (Code: ${statusCode})`);

                if (statusCode === DisconnectReason.loggedOut) {
                    botStatus = 'Session Resetting...';
                    clearSession();
                    restartBot(2000);
                } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
                    botStatus = 'Finalizing Login...';
                    restartBot(1000);
                } else {
                    botStatus = 'Reconnecting...';
                    restartBot(4000);
                }
            }

            if (connection === 'open') {
                isLinked = true;
                latestQR = '';
                latestPairingCode = '';
                wantPairingCode = false;
                botStatus = '✅ Connected & Ready!';
                addLog('✅ Bot WhatsApp se connect ho gaya hai!');
                refreshGroups();

                if (!cronStarted) {
                    cronStarted = true;
                    cron.schedule('* * * * *', () => {
                        if (!settings.autoEnabled || !isLinked) return;
                        const nowIST = new Date().toLocaleTimeString('en-GB', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        });
                        if (nowIST === lastCronMinute) return;
                        if (nowIST === settings.time1 || (settings.time2 && nowIST === settings.time2)) {
                            lastCronMinute = nowIST;
                            sendAIContent(settings.computerChapter, settings.contentType, settings.count);
                        }
                    });
                }
            }
        });
    } catch (err) {
        addLog(`❌ Bot start error: ${err.message}`);
        restartBot(4000);
    }
}

startBot();
