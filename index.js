const http = require('http');
const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const cron = require('node-cron');
const { GoogleGenAI } = require('@google/genai');

// Details
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'AQ.Ab8RN6ImoJcdbJFs8vnUOSY_59MyUfWGAPjGscIRE1VjpuyjZw'
});
const PHONE_NUMBER = '918601975828';
const GROUP_NAME = 'Arpit';
const AUTH_DIR = path.join(__dirname, 'auth_info');

// Bot State
let globalSock = null;
let reconnectTimer = null;
let botStatus = 'Starting...';
let latestQR = '';
let latestPairingCode = '';
let wantPairingCode = false;
let isLinked = false;
let cronStarted = false;
const activityLogs = [];

let settings = {
    autoEnabled: true,
    time1: '08:00',
    time2: '18:00',
    count: 1,
    subject: 'Mix (Science, Maths, SST, Hindi)',
    contentType: 'Important Study Topic'
};

function addLog(msg) {
    const time = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const entry = `[${time}] ${msg}`;
    console.log(entry);
    activityLogs.unshift(entry);
    if (activityLogs.length > 30) activityLogs.pop();
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

function restartBot(delayMs = 3000) {
    stopCurrentSocket();
    reconnectTimer = setTimeout(() => {
        startBot();
    }, delayMs);
}

async function sendToGroup(text) {
    if (!globalSock || !isLinked) throw new Error('Bot abhi WhatsApp se connect nahi hai!');
    const groups = await globalSock.groupFetchAllParticipating();
    const targetGroup = Object.values(groups).find(
        (g) => g.subject && g.subject.trim() === GROUP_NAME
    );
    if (!targetGroup) throw new Error(`Group "${GROUP_NAME}" nahi mila!`);
    await globalSock.sendMessage(targetGroup.id, { text });
}

// AI se Quiz ya Padhai ka Topic generate karke bhejna
async function sendAIContent(subject, type, count = 1) {
    try {
        addLog(`⏳ AI se ${count} ${type} (${subject}) banwa raha hu...`);
        let prompt = '';

        if (type === 'MCQ Quiz') {
            prompt = `Class 10 Board Exam (${subject}) ke ${count} bahut important MCQ questions banao Hindi/Hinglish mein.
Format:
📚 *Class 10 ${subject} Quiz*
*Q1.* [Sawal]
A) [Option 1]
B) [Option 2]
C) [Option 3]
D) [Option 4]
(Answer mat likhna, sirf questions aur options dena)`;
        } else if (type === 'Important Study Topic') {
            prompt = `Class 10 Board Exam (${subject}) ka ${count} bahut zaroori aur exam mein aane wala topic chuno aur use simple Hindi/Hinglish mein samjhao taaki students aasani se padh sakein.
Format:
📖 *Aaj Ka Important Topic (${subject})*
*Topic:* [Topic ka naam]
*Kyun Zaroori Hai:* [1 line]
*Asaan Samajh:* [Bullet points mein main points]
*Exam Tip:* [1 line]`;
        } else if (type === 'Short Question + Answer') {
            prompt = `Class 10 Board Exam (${subject}) ke ${count} important 2-mark Short Questions aur unke clear Answers likho Hindi/Hinglish mein. WhatsApp *bold* formatting use karna.`;
        } else if (type === 'Important Formula / Fact') {
            prompt = `Class 10 Board Exam (${subject}) ke ${count} important Formulas ya Revision Points likho simple Hindi/Hinglish mein.`;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        await sendToGroup(response.text);
        addLog(`✅ ${count} ${type} (${subject}) "${GROUP_NAME}" group mein bhej diya gaya!`);
    } catch (err) {
        addLog(`❌ Error: ${err.message || err}`);
    }
}

// Web Dashboard HTML
function getDashboardHTML() {
    const logsHtml = activityLogs.map(l => `<div class="log-item">${l}</div>`).join('') || '<div class="log-item">Abhi koi activity nahi hai.</div>';

    // Jab tak QR ya Pairing Code load ho raha ho, page khud 3 sec mein refresh ho
    const isLoadingAuth = !isLinked && (
        (!wantPairingCode && !latestQR) ||
        (wantPairingCode && (!latestPairingCode || latestPairingCode.includes('Generating')))
    );
    const autoRefreshTag = isLoadingAuth ? '<meta http-equiv="refresh" content="3">' : '';

    let authSection = '';
    if (!isLinked) {
        authSection = `<div class="auth-box">`;
        if (!wantPairingCode) {
            if (latestQR) {
                const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(latestQR)}`;
                authSection += `
                    <p><b>📷 WhatsApp se yeh QR Code Scan karein:</b></p>
                    <img src="${qrImgUrl}" alt="WhatsApp QR Code" style="border: 5px solid #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
                `;
            } else {
                authSection += `<p>⏳ QR Code ban raha hai... (3 second mein apne aap load hoga)</p>`;
            }
        } else {
            authSection += `<p><b>🔑 Apna 8-Digit Pairing Code WhatsApp mein dalein:</b></p>`;
            authSection += `<div class="code">${latestPairingCode || 'Generating...'}</div>`;
        }

        authSection += `
            <div class="row">
                <div>
                    <form method="POST" action="/get-qr">
                        <button type="submit" class="blue">📷 Naya QR Code</button>
                    </form>
                </div>
                <div>
                    <form method="POST" action="/get-pairing">
                        <button type="submit" class="orange">🔑 Naya Pairing Code</button>
                    </form>
                </div>
            </div>
        </div>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${autoRefreshTag}
    <title>Arpit Class 10 Bot</title>
    <style>
        body { font-family: sans-serif; background: #f0f2f5; margin: 0; padding: 15px; color: #222; }
        .card { background: #fff; padding: 15px; border-radius: 10px; margin-bottom: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        h2, h3 { margin-top: 0; color: #075e54; }
        label { font-size: 13px; font-weight: bold; display: block; margin-top: 10px; color: #444; }
        .status { font-weight: bold; color: #128c7e; }
        .auth-box { text-align: center; background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 10px 0; border: 1px dashed #ccc; }
        .code { font-size: 24px; font-weight: bold; letter-spacing: 3px; color: #d32f2f; text-align: center; padding: 10px; background: #ffebee; border-radius: 8px; margin: 10px 0; }
        select, textarea, input, button { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box; font-size: 15px; }
        button { background: #25d366; color: white; border: none; font-weight: bold; cursor: pointer; margin-top: 10px; }
        button.blue { background: #1976d2; }
        button.orange { background: #f57c00; }
        button.gray { background: #555; }
        .row { display: flex; gap: 10px; }
        .row > div { flex: 1; }
        .logs { background: #1e1e1e; color: #00e676; padding: 10px; border-radius: 6px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; }
        .log-item { margin-bottom: 5px; border-bottom: 1px solid #333; padding-bottom: 3px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>🤖 Arpit Class 10 Bot</h2>
        <p><b>Status:</b> <span class="status">${botStatus}</span></p>
        <p><b>Group:</b> ${GROUP_NAME} | <b>Auto:</b> ${settings.autoEnabled ? '🟢 ON' : '🔴 OFF'} (${settings.time1} & ${settings.time2})</p>
        ${authSection}
        <a href="/"><button class="gray">🔄 Refresh Status & Logs</button></a>
    </div>

    <div class="card">
        <h3>⏰ Auto-Schedule Settings (Kab aur Kitna Bhejna Hai)</h3>
        <form method="POST" action="/save-schedule">
            <div class="row">
                <div>
                    <label>Time 1 (IST):</label>
                    <input type="time" name="time1" value="${settings.time1}" required>
                </div>
                <div>
                    <label>Time 2 (IST):</label>
                    <input type="time" name="time2" value="${settings.time2}">
                </div>
            </div>
            <label>Auto-Mode:</label>
            <select name="autoEnabled">
                <option value="true" ${settings.autoEnabled ? 'selected' : ''}>🟢 ON (Chalu Rakhein)</option>
                <option value="false" ${!settings.autoEnabled ? 'selected' : ''}>🔴 OFF (Band Rakhein)</option>
            </select>
            <label>Subject:</label>
            <select name="subject">
                <option value="Mix (Science, Maths, SST, Hindi)" ${settings.subject.includes('Mix') ? 'selected' : ''}>Mix (Sabhi Subjects)</option>
                <option value="Science" ${settings.subject === 'Science' ? 'selected' : ''}>Science</option>
                <option value="Maths" ${settings.subject === 'Maths' ? 'selected' : ''}>Maths</option>
                <option value="SST" ${settings.subject === 'SST' ? 'selected' : ''}>Social Science (SST)</option>
                <option value="Hindi" ${settings.subject === 'Hindi' ? 'selected' : ''}>Hindi</option>
                <option value="English" ${settings.subject === 'English' ? 'selected' : ''}>English</option>
                <option value="Computer" ${settings.subject === 'Computer' ? 'selected' : ''}>Computer</option>
            </select>
            <div class="row">
                <div>
                    <label>Kya Bhejna Hai:</label>
                    <select name="contentType">
                        <option value="Important Study Topic" ${settings.contentType === 'Important Study Topic' ? 'selected' : ''}>📖 Padhai ka Important Topic</option>
                        <option value="MCQ Quiz" ${settings.contentType === 'MCQ Quiz' ? 'selected' : ''}>📝 MCQ Quiz</option>
                        <option value="Short Question + Answer" ${settings.contentType === 'Short Question + Answer' ? 'selected' : ''}>❓ Short Q&A</option>
                        <option value="Important Formula / Fact" ${settings.contentType === 'Important Formula / Fact' ? 'selected' : ''}>📌 Important Formulas</option>
                    </select>
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
            <button type="submit" class="blue">💾 Schedule Save Karein</button>
        </form>
    </div>

    <div class="card">
        <h3>⚡ Abhi Turant AI Se Bhejein</h3>
        <form method="POST" action="/send-ai">
            <select name="subject">
                <option value="Science">Science</option>
                <option value="Maths">Maths</option>
                <option value="SST">Social Science (SST)</option>
                <option value="Hindi">Hindi</option>
                <option value="English">English</option>
                <option value="Computer">Computer</option>
            </select>
            <div class="row">
                <div>
                    <select name="type">
                        <option value="Important Study Topic">📖 Padhai ka Important Topic</option>
                        <option value="MCQ Quiz">📝 MCQ Quiz</option>
                        <option value="Short Question + Answer">❓ Short Q&A</option>
                        <option value="Important Formula / Fact">📌 Important Formulas</option>
                    </select>
                </div>
                <div>
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
        <div class="logs">${logsHtml}</div>
    </div>
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

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const params = new URLSearchParams(body);

            if (req.url === '/get-pairing') {
                wantPairingCode = true;
                latestQR = '';
                latestPairingCode = 'Generating...';
                botStatus = '⏳ Naya Pairing Code bana raha hu...';
                addLog('🔄 Fresh Pairing Code request start kiya...');
                clearSession();
                restartBot(500);
            } else if (req.url === '/get-qr') {
                wantPairingCode = false;
                latestQR = '';
                latestPairingCode = '';
                botStatus = '⏳ Naya QR Code bana raha hu...';
                addLog('🔄 Fresh QR Code request start kiya...');
                clearSession();
                restartBot(500);
            } else if (req.url === '/save-schedule') {
                settings.autoEnabled = params.get('autoEnabled') === 'true';
                settings.time1 = params.get('time1') || '08:00';
                settings.time2 = params.get('time2') || '';
                settings.subject = params.get('subject') || 'Science';
                settings.contentType = params.get('contentType') || 'Important Study Topic';
                settings.count = parseInt(params.get('count') || '1', 10);
                addLog(`⚙️ Schedule updated: ${settings.time1} & ${settings.time2} | ${settings.count} ${settings.contentType}`);
            } else if (req.url === '/send-ai') {
                const subject = params.get('subject') || 'Science';
                const type = params.get('type') || 'Important Study Topic';
                const count = parseInt(params.get('count') || '1', 10);
                sendAIContent(subject, type, count);
            } else if (req.url === '/send-custom') {
                const msg = params.get('message');
                if (msg) {
                    try {
                        await sendToGroup(msg);
                        addLog(`✅ Custom message bheja: "${msg.slice(0, 30)}..."`);
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
            const latest = await fetchLatestBaileysVersion();
            version = latest.version;
        } catch (e) {}

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
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
                            let code = await sock.requestPairingCode(PHONE_NUMBER);
                            code = code?.match(/.{1,4}/g)?.join('-') || code;
                            latestPairingCode = code;
                            botStatus = '🔑 Pairing Code Ready!';
                            addLog(`👉 Naya Pairing Code: ${code}`);
                        } catch (err) {
                            latestPairingCode = 'Error! Dobara button dabayein.';
                            addLog(`❌ Pairing Code error: ${err.message}`);
                        }
                    }, 1000);
                } else if (!wantPairingCode) {
                    latestQR = qr;
                    botStatus = '📷 QR Code Ready! Scan karein.';
                    addLog('📷 Naya QR Code ready hai (http://localhost:3000 par dekhein).');
                }
            }

            if (connection === 'close') {
                isLinked = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                addLog(`⚠️ Connection close (Code: ${statusCode})`);

                if (statusCode === DisconnectReason.loggedOut) {
                    botStatus = 'Session Resetting...';
                    addLog('🗑️ Purana session (401) delete karke fresh start kar raha hu...');
                    clearSession();
                    restartBot(3000);
                } else {
                    botStatus = 'Reconnecting...';
                    restartBot(5000);
                }
            }

            if (connection === 'open') {
                isLinked = true;
                latestQR = '';
                latestPairingCode = '';
                wantPairingCode = false;
                botStatus = '✅ Connected & Ready!';
                addLog('✅ Bot WhatsApp se connect ho gaya hai!');

                if (!cronStarted) {
                    cronStarted = true;
                    cron.schedule('* * * * *', () => {
                        if (!settings.autoEnabled) return;
                        const nowIST = new Date().toLocaleTimeString('en-GB', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        });
                        if (nowIST === settings.time1 || (settings.time2 && nowIST === settings.time2)) {
                            sendAIContent(settings.subject, settings.contentType, settings.count);
                        }
                    });
                }
            }
        });
    } catch (err) {
        addLog(`❌ Bot start error: ${err.message}`);
        restartBot(5000);
    }
}

startBot();
