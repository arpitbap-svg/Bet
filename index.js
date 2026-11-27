const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URLSearchParams } = require('url');
const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, Browsers } = baileys;
const pino = require('pino');
const cron = require('node-cron');

let createCanvas = null;
try {
    ({ createCanvas } = require('@napi-rs/canvas'));
} catch (e) {
    createCanvas = null;
}

const AUTH_DIR = path.join(__dirname, 'auth_info');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

// Class 10 UP Board Computer Exact Syllabus (Vishay-Suchi)
const SYLLABUS = [
    {
        id: '1',
        name: 'Ch 1: C Bhasha ka Parichay (Intro to C)',
        important: false,
        topics: [
            'Programming Bhasha',
            'Programming Bhasha ki Peedhiyan (Generations)',
            'Algorithm',
            'Flowchart',
            'C Bhasha ka Parichay',
            'Data Types in C',
            'Variables ki Avdharna (Concept of Variables)',
            'Input-Output Statement (printf, scanf)'
        ]
    },
    {
        id: '2',
        name: 'Ch 2: Control Statement',
        important: true,
        topics: [
            'Branching (if, if-else, switch)',
            'Looping (for, while, do-while)',
            'Jumping (break, continue, goto)'
        ]
    },
    {
        id: '3',
        name: 'Ch 3: Arrays',
        important: true,
        topics: [
            'Ek-Vimiya Array (1D Array)',
            'Dwi-Vimiya Array (2D Array)',
            'Searching (Linear & Binary Search)',
            'Sorting (Bubble, Selection Sorting)'
        ]
    },
    {
        id: '4',
        name: 'Ch 4: Function',
        important: false,
        topics: [
            'Function ke Gun (Properties)',
            'Header File',
            'Functions ke Prakar (Library & User-defined)',
            'Parameter aur Arguments',
            'Argument aur Return Value ke aadhar par Function ka Vargikaran',
            'Functions ki Nesting',
            'Recursion',
            'Function ko Array Pass Karna'
        ]
    },
    {
        id: '5',
        name: 'Ch 5: Strings',
        important: true,
        topics: [
            'String ko Ghoshit Karna (Declaring String)',
            'Terminal se String Padhna (Reading String)',
            'Screen par String Print Karna (Printing String)',
            'String Functions (strlen, strcpy, strcat, strcmp)'
        ]
    },
    {
        id: '6',
        name: 'Ch 6: Structure aur Union',
        important: false,
        topics: [
            'Structure',
            'Structure ke liye typedef',
            'Nested Structure',
            'Structure ke Anuprayog (Applications)',
            'Structure ki Seemayein (Limitations)',
            'Union',
            'Union ke Anuprayog',
            'Union ki Seemayein (Structure vs Union)'
        ]
    },
    {
        id: '7',
        name: 'Ch 7: Pointers',
        important: false,
        topics: [
            'Programming mein Pointers ka Upyog',
            'Pointer ke Prakar (Types of Pointers)',
            'Pointers Arithmetic Operations',
            'Pointers aur Array',
            'Structure Pointer',
            'Pointers ke Anuprayog',
            'Pointers ke Labh (Advantages)'
        ]
    },
    {
        id: '8',
        name: 'Ch 8: File Handling',
        important: false,
        topics: [
            'File kya hai',
            'Filon ke Prakar (Text & Binary Files)',
            'File Pointer (FILE *)',
            'File ko Open Karna (fopen modes)',
            'Nayi File Banana',
            'File mein Kisi Vishisht Position par Jana (fseek, ftell, rewind)',
            'Binary File Operations',
            'Input/Output Operation ke Samay Error Handling'
        ]
    },
    {
        id: '9',
        name: 'Ch 9: Artificial Intelligence (AI)',
        important: true,
        topics: [
            'AI ka Parichay',
            'AI ke Anuprayog (Applications)',
            'AI ki Visheshtayein (Characteristics)',
            'AI ke Prakar (Types of AI)',
            'Bhavishya mein AI ki Sankalpna (Future of AI)',
            'Typical AI dwara Samasya ka Samadhan',
            'Intelligent Agent'
        ]
    },
    {
        id: '10',
        name: 'Ch 10: Drone Technology (Drone Praudyogiki)',
        important: true,
        topics: [
            'Drone Technology ka Parichay',
            'Drone ke Ghatak (Components of Drone)',
            'Drone ke Prakar (Types of Drones)',
            'Drone / UAV Kaise Karya Karte Hain'
        ]
    },
    {
        id: '11',
        name: 'Ch 11: E-Commerce aur E-Governance',
        important: false,
        topics: [
            'E-Commerce (B2B, B2C, C2C)',
            'E-Payment (UPI, Net Banking, Cards, Wallets)',
            'E-Governance'
        ]
    },
    {
        id: '12',
        name: 'Ch 12: Cyber Suraksha (Cyber Security)',
        important: true,
        topics: [
            'Cyber Suraksha ke Tatva (Elements)',
            'Cyber Suraksha ke Prakar (Types)',
            'Cyber Crime (Phishing, Hacking, Malware)',
            'Cyber Crime se Sambandhit Samasya aur Unke Samadhan'
        ]
    }
];

const CONTENT_TYPES = [
    { val: 'Short + Long Q&A (Combo)', label: '📚 Short + Long Q&A (Dono Ek Saath)' },
    { val: 'WhatsApp Poll + Auto Answer', label: '📊 WhatsApp Poll + Delayed Answer (1-2 Hr)' },
    { val: 'WhatsApp Poll (MCQ)', label: '📊 WhatsApp Poll (Sirf MCQ)' },
    { val: 'Question & Answer (Short 2-4 Marks)', label: '❓ Sirf Short Q&A (2-4 Marks)' },
    { val: 'Long Question & Answer (5-6 Marks)', label: '📄 Sirf Long Q&A (5-6 Marks)' },
    { val: 'Important Board Topic (Notes)', label: '📖 Important Board Topic (Notes)' },
    { val: 'Text MCQ Quiz (With Answer)', label: '✅ Text MCQ Quiz (With Answer)' },
    { val: 'C Program / Coding Q&A', label: '💻 C Program / Coding Q&A' }
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_SETTINGS = {
    geminiApiKey: '',
    geminiModel: 'auto',
    phoneNumber: '919369249280',
    groupName: 'Arpit',
    aiNature: 'Tum ek experienced Class 10 UP Board Computer Science teacher ho. Hamesha simple, clear Hindi/Hinglish mein samjhao. Sirf wahi important Computer questions, MCQs aur topics bhejo jo board paper mein baar-baar puche jate hain. WhatsApp formatting (*bold*, bullet points) use karo aur faltu lambi baatein mat likho.',
    // Slash Command (/Question) Settings
    slashAskEnabled: true,
    slashOnlyTargetGroup: true,
    selectedChapters: ['2', '3', '5', '9', '10', '12'],
    specificTopic: '',
    // Auto-Course Settings
    progressEnabled: true,
    progressUnit: 'chapter',
    progressScope: 'all',
    progressAdvanceRule: 'daily',
    progressChapterId: '1',
    progressTopicIndex: 0,
    progressLastStudyDate: '',
    // Slot 1 & Slot 2
    slot1Enabled: true,
    slot1Time: '06:00',
    slot1Type: 'Short + Long Q&A (Combo)',
    slot1Count: 3,
    slot1ShortCount: 3,
    slot1LongCount: 1,
    slot2Enabled: true,
    slot2Time: '16:00',
    slot2Type: 'WhatsApp Poll + Auto Answer',
    slot2Count: 5,
    slot2ShortCount: 2,
    slot2LongCount: 1,
    // Delayed Answer Key, Anti-Cheat & Leaderboard Settings
    answerDelayMins: 90,
    minAttemptsForAnswer: 2,
    antiCheatEnabled: true,
    pollGapLimitSecs: 60,        // Har poll ke liye 1 minute (60 sec)
    antiCheatTarget: 'group',    // 'group' (Naam + @Tag), 'dm' (Personal DM), 'both' (Dono)
    dailyRankEnabled: true,
    dailyRankTime: '07:30',
    dailyRankTarget: 'yesterday',
    weeklyRankEnabled: true,
    weeklyRankDay: 0,
    weeklyRankTime: '20:00'
};

let settings = { ...DEFAULT_SETTINGS };

let leaderboard = {
    names: {},
    polls: {},
    batches: [],
    daily: {},
    weekly: {}
};

function clampInt(val, min, max, fallback) {
    const n = parseInt(val, 10);
    if (isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            settings = { ...DEFAULT_SETTINGS, ...saved };
            if (!Array.isArray(settings.selectedChapters) || settings.selectedChapters.length === 0) {
                settings.selectedChapters = [...DEFAULT_SETTINGS.selectedChapters];
            }
            settings.progressTopicIndex = parseInt(settings.progressTopicIndex, 10) || 0;
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

function loadLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_FILE)) {
            const saved = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
            leaderboard = {
                names: saved.names || {},
                polls: saved.polls || {},
                batches: Array.isArray(saved.batches) ? saved.batches : [],
                daily: saved.daily || {},
                weekly: saved.weekly || {}
            };
        }
    } catch (e) {
        console.log('Leaderboard load error:', e.message);
    }
}

function saveLeaderboard() {
    try {
        const pollIds = Object.keys(leaderboard.polls);
        if (pollIds.length > 150) {
            const toDelete = pollIds.slice(0, pollIds.length - 150);
            for (const id of toDelete) delete leaderboard.polls[id];
        }
        if (leaderboard.batches.length > 40) {
            leaderboard.batches = leaderboard.batches.slice(-40);
        }
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));
    } catch (e) {
        console.log('Leaderboard save error:', e.message);
    }
}

function getActiveApiKey() {
    const raw = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
    return raw.trim().replace(/^["']|["']$/g, '');
}

// IST Date / Week Helpers
function getISTParts(offsetDays = 0) {
    const d = new Date(Date.now() + offsetDays * 86400000);
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short'
    });
    const parts = {};
    for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
    const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[parts.weekday] ?? 0;

    const utcDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    const dayNum = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    const weekKey = `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

    const prettyDate = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(d);

    return { dateStr, weekKey, dayOfWeek, prettyDate };
}

function getTodayIST() { return getISTParts(0).dateStr; }
function getYesterdayIST() { return getISTParts(-1).dateStr; }
function getCurrentWeekIST() { return getISTParts(0).weekKey; }

loadConfig();
loadLeaderboard();

// Bot State
let globalSock = null;
let reconnectTimer = null;
let botStatus = 'Starting...';
let latestQR = '';
let latestPairingCode = '';
let wantPairingCode = false;
let isLinked = false;
let cronStarted = false;
let lastSlot1Minute = '';
let lastSlot2Minute = '';
let lastDailyRankMinute = '';
let lastWeeklyRankMinute = '';
let availableGroups = [];
let targetGroupId = '';
let detectedWorkingModel = '';
const activityLogs = [];
const sentMessageCache = new Map();
const processedSlashIds = new Set();
const userSlashCooldown = new Map();
const antiCheatTimers = new Map(); // key: `${batchId}:${voterId}` -> Timeout

function addLog(msg) {
    const time = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const entry = `[${time}] ${msg}`;
    console.log(entry);
    activityLogs.unshift(entry);
    if (activityLogs.length > 45) activityLogs.pop();
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeJson(obj) {
    return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normJid(jid) {
    if (!jid) return '';
    if (typeof baileys.jidNormalizedUser === 'function') {
        try { return baileys.jidNormalizedUser(jid); } catch (e) {}
    }
    return String(jid).replace(/:\d+@/, '@');
}

function normalizeAnswerText(str) {
    return String(str || '')
        .replace(/^[A-Da-d][\)\.\-:]\s*/, '')
        .trim()
        .toLowerCase();
}

function formatDisplayName(voterId, fallbackName) {
    if (fallbackName && fallbackName.trim()) return fallbackName.trim();
    if (leaderboard.names[voterId]) return leaderboard.names[voterId];
    const digits = String(voterId || '').replace(/@.*$/, '').replace(/[^0-9]/g, '');
    if (digits.length >= 4) return `Student ${digits.slice(-4)}`;
    return 'Student';
}

function formatLimitText(secs) {
    const s = clampInt(secs, 15, 600, 60);
    if (s % 60 === 0) return `${s / 60} minute`;
    return `${s} seconds`;
}

function extractMessageText(msg) {
    const m = msg?.message;
    if (!m) return '';
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.ephemeralMessage?.message) return extractMessageText({ message: m.ephemeralMessage.message });
    if (m.viewOnceMessage?.message) return extractMessageText({ message: m.viewOnceMessage.message });
    if (m.viewOnceMessageV2?.message) return extractMessageText({ message: m.viewOnceMessageV2.message });
    return '';
}

// ==========================================
// 1-Minute Poll Anti-Cheat Monitor
// ==========================================
function clearBatchAntiCheatTimers(batchId) {
    const prefix = `${batchId}:`;
    for (const [k, timer] of antiCheatTimers.entries()) {
        if (k.startsWith(prefix)) {
            clearTimeout(timer);
            antiCheatTimers.delete(k);
        }
    }
}

async function sendAntiCheatWarning(batch, track) {
    try {
        if (!globalSock || !isLinked) return;
        const limitText = formatLimitText(settings.pollGapLimitSecs);
        const studentName = track.name || 'Student';
        const mentionNum = String(track.mentionJid || '').split('@')[0];
        const mentionPart = mentionNum ? `@${mentionNum} (*${studentName}*)` : `*${studentName}*`;

        const groupMsg =
            `⚠️ *Anti-Cheat Alert — ${studentName}*\n\n` +
            `${mentionPart}, Are you trying to cheat? Your voting activity seems unusual. Please vote honestly!\n\n` +
            `⏱️ _Har poll ko karne ka sirf ${limitText} ka samay hai._`;

        const dmMsg =
            `⚠️ *Anti-Cheat Alert — ${studentName}*\n\n` +
            `Hi *${studentName}*, Are you trying to cheat? Your voting activity seems unusual. Please vote honestly!\n\n` +
            `⏱️ _Har poll ko karne ka sirf ${limitText} ka samay hai._`;

        const mode = settings.antiCheatTarget || 'group';

        if (mode === 'group' || mode === 'both') {
            const gId = batch.groupId || targetGroupId || (await getTargetGroup()).id;
            await globalSock.sendMessage(gId, {
                text: groupMsg,
                mentions: track.mentionJid ? [track.mentionJid] : []
            });
            addLog(`🚨 Anti-Cheat Warning (Group) -> ${studentName} (> ${limitText} delay)`);
        }

        if (mode === 'dm' || mode === 'both') {
            let dmSent = false;
            if (track.dmJid && !track.dmJid.endsWith('@g.us')) {
                try {
                    await globalSock.sendMessage(track.dmJid, { text: dmMsg });
                    dmSent = true;
                    addLog(`🚨 Anti-Cheat Warning (DM) -> ${studentName} (> ${limitText} delay)`);
                } catch (dmErr) {
                    addLog(`⚠️ DM warning fail (${studentName}): ${dmErr.message}`);
                }
            }
            // Agar DM fail ho aur mode sirf 'dm' tha, toh group fallback bhej dein
            if (!dmSent && mode === 'dm') {
                const gId = batch.groupId || targetGroupId || (await getTargetGroup()).id;
                await globalSock.sendMessage(gId, {
                    text: groupMsg,
                    mentions: track.mentionJid ? [track.mentionJid] : []
                });
                addLog(`🚨 Anti-Cheat Warning (Group Fallback) -> ${studentName}`);
            }
        }
    } catch (err) {
        addLog(`❌ Anti-Cheat warning error: ${err.message}`);
    }
}

function trackAntiCheatOnVote(poll, voterId, studentName, mentionJid, dmJid) {
    if (!settings.antiCheatEnabled) return;
    const batch = leaderboard.batches.find(b => b.id === poll.batchId);
    if (!batch || !Array.isArray(batch.pollIds) || batch.pollIds.length <= 1) return;

    if (!batch.voterTrack) batch.voterTrack = {};
    const limitSecs = clampInt(settings.pollGapLimitSecs, 15, 600, 60);
    const limitMs = limitSecs * 1000;
    const now = Date.now();
    const timerKey = `${batch.id}:${voterId}`;

    // Purana timer clear karein
    if (antiCheatTimers.has(timerKey)) {
        clearTimeout(antiCheatTimers.get(timerKey));
        antiCheatTimers.delete(timerKey);
    }

    const prev = batch.voterTrack[voterId];
    // Backup gap check (agar server restart hone par purana timer miss hua ho)
    if (prev && prev.lastVoteAt > 0 && (now - prev.lastVoteAt) > limitMs && !prev.warnedForLastVote) {
        prev.name = studentName;
        prev.mentionJid = mentionJid || prev.mentionJid;
        prev.dmJid = dmJid || prev.dmJid;
        prev.warnedForLastVote = true;
        sendAntiCheatWarning(batch, prev);
    }

    // Current vote record update karein
    batch.voterTrack[voterId] = {
        name: studentName,
        mentionJid: mentionJid || prev?.mentionJid || voterId,
        dmJid: dmJid || prev?.dmJid || voterId,
        lastVoteAt: now,
        warnedForLastVote: false
    };
    saveLeaderboard();

    // Check karein ki is student ke kitne polls bache hain
    let votedCount = 0;
    for (const pid of batch.pollIds) {
        if (leaderboard.polls[pid]?.votes?.[voterId]) votedCount++;
    }
    if (votedCount >= batch.pollIds.length) {
        // Saare polls complete ho gaye -> koi timer nahi chahiye
        return;
    }

    // Next poll ke liye 1-minute countdown start karein
    const timer = setTimeout(async () => {
        antiCheatTimers.delete(timerKey);
        const freshBatch = leaderboard.batches.find(b => b.id === batch.id);
        if (!freshBatch) return;

        // Agar quiz ke saare polls lock ho chuke hain toh warning na bhejein
        const allLocked = freshBatch.pollIds.every(pid => leaderboard.polls[pid]?.locked);
        if (allLocked) return;

        const freshTrack = freshBatch.voterTrack?.[voterId];
        if (!freshTrack || freshTrack.lastVoteAt !== now || freshTrack.warnedForLastVote) return;

        let done = 0;
        for (const pid of freshBatch.pollIds) {
            if (leaderboard.polls[pid]?.votes?.[voterId]) done++;
        }
        if (done >= freshBatch.pollIds.length) return;

        freshTrack.warnedForLastVote = true;
        saveLeaderboard();
        await sendAntiCheatWarning(freshBatch, freshTrack);
    }, limitMs);

    antiCheatTimers.set(timerKey, timer);
}

// ==========================================
// Slash Command (/Question) Instant AI Reply
// ==========================================
async function handleSlashQuestion(msg) {
    try {
        if (!settings.slashAskEnabled || !globalSock || !isLinked) return;

        const msgId = msg.key?.id;
        const chatJid = msg.key?.remoteJid;
        if (!msgId || !chatJid || chatJid === 'status@broadcast') return;
        if (processedSlashIds.has(msgId)) return;

        const rawText = extractMessageText(msg).trim();
        if (!rawText.startsWith('/')) return;

        const question = rawText.slice(1).trim();
        if (!question) return;

        const ts = Number(msg.messageTimestamp || 0);
        if (ts > 0 && (Date.now() / 1000 - ts) > 90) return;

        if (settings.slashOnlyTargetGroup) {
            if (!targetGroupId) await refreshGroups();
            if (!targetGroupId || chatJid !== targetGroupId) return;
        }

        const senderId = normJid(msg.key?.participantAlt || msg.key?.participant || chatJid);
        const now = Date.now();
        const lastUsed = userSlashCooldown.get(senderId) || 0;
        if (now - lastUsed < 6000) return;
        userSlashCooldown.set(senderId, now);

        processedSlashIds.add(msgId);
        if (processedSlashIds.size > 300) {
            const first = processedSlashIds.values().next().value;
            processedSlashIds.delete(first);
        }

        const apiKey = getActiveApiKey();
        if (!apiKey) {
            addLog('❌ /Question ignore hua: Gemini API Key set nahi hai.');
            return;
        }

        const studentName = formatDisplayName(senderId, msg.pushName);
        addLog(`💬 ${studentName} ne pucha: "/${question.slice(0, 60)}"`);

        try { await globalSock.sendPresenceUpdate('composing', chatJid); } catch (e) {}

        const prompt = `WhatsApp group mein ek student (${studentName}) ne yeh sawal pucha hai:
"${question}"

Iska bilkul sahi, clear aur asaan Hindi/Hinglish mein jawab do.
Rules:
- WhatsApp formatting (*bold*, bullet points) use karo.
- Agar coding/C program pucha ho toh chhota aur sahi code + output do.
- Jawab sidha aur to-the-point rakho, faltu intro ya lambi bhumika mat likho.`;

        const answer = await generateWithAutoGemini(apiKey, prompt, settings.aiNature);

        await globalSock.sendMessage(
            chatJid,
            { text: `🤖 *AI Answer*\n\n${answer}` },
            { quoted: msg }
        );

        try { await globalSock.sendPresenceUpdate('paused', chatJid); } catch (e) {}

        addLog(`✅ ${studentName} ke /question ka jawab group mein bhej diya gaya!`);
    } catch (err) {
        addLog(`❌ /Question error: ${err.message || err}`);
        try {
            const chatJid = msg.key?.remoteJid;
            if (chatJid && globalSock) {
                await globalSock.sendMessage(
                    chatJid,
                    { text: '⚠️ Abhi jawab generate karne mein thodi dikkat aayi, kripya thodi der baad dobara try karein.' },
                    { quoted: msg }
                );
            }
        } catch (e) {}
    }
}

// ==========================================
// Leaderboard Ranking & Designed PNG Image
// ==========================================
function getRankedEntries(period = 'daily', dayMode = 'today') {
    let bucket = {};
    let title = 'DAILY LEADERBOARD';
    let subtitle = '';

    if (period === 'weekly') {
        const info = getISTParts(0);
        bucket = leaderboard.weekly[info.weekKey] || {};
        title = 'WEEKLY CHAMPIONS';
        subtitle = `Week ${info.weekKey}  •  ${settings.groupName}`;
    } else {
        const offset = dayMode === 'yesterday' ? -1 : 0;
        const info = getISTParts(offset);
        bucket = leaderboard.daily[info.dateStr] || {};
        title = dayMode === 'yesterday' ? 'DAILY TOPPERS' : "TODAY'S LIVE RANK";
        subtitle = `${info.prettyDate}  •  ${settings.groupName}`;
    }

    const list = Object.entries(bucket)
        .map(([id, s]) => {
            const correct = Number(s.correct) || 0;
            const attempted = Math.max(Number(s.attempted) || 0, correct);
            const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
            return {
                id,
                name: formatDisplayName(id, s.name),
                correct,
                attempted,
                accuracy
            };
        })
        .sort((a, b) =>
            (b.correct - a.correct) ||
            (b.accuracy - a.accuracy) ||
            (b.attempted - a.attempted) ||
            a.name.localeCompare(b.name)
        );

    return { title, subtitle, list };
}

function getDemoEntries(period = 'daily') {
    const info = getISTParts(0);
    return {
        title: period === 'weekly' ? 'WEEKLY CHAMPIONS (DEMO)' : 'DAILY TOPPERS (DEMO)',
        subtitle: `${info.prettyDate}  •  ${settings.groupName}`,
        list: [
            { name: 'Rahul Verma', correct: 14, attempted: 15, accuracy: 93 },
            { name: 'Priya Singh', correct: 12, attempted: 15, accuracy: 80 },
            { name: 'Aman Maurya', correct: 11, attempted: 14, accuracy: 79 },
            { name: 'Neha Yadav', correct: 9, attempted: 13, accuracy: 69 },
            { name: 'Vikas Kumar', correct: 8, attempted: 12, accuracy: 67 },
            { name: 'Anjali Gupta', correct: 7, attempted: 12, accuracy: 58 },
            { name: 'Rohit Sharma', correct: 6, attempted: 11, accuracy: 55 }
        ]
    };
}

function drawRoundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
    let str = String(text || '');
    if (ctx.measureText(str).width <= maxWidth) return str;
    while (str.length > 1 && ctx.measureText(str + '...').width > maxWidth) {
        str = str.slice(0, -1);
    }
    return str + '...';
}

function getInitials(name) {
    const parts = String(name || 'S').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || 'S').slice(0, 2).toUpperCase();
}

function drawCrown(ctx, cx, bottomY) {
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 24, bottomY);
    ctx.lineTo(cx - 28, bottomY - 22);
    ctx.lineTo(cx - 11, bottomY - 10);
    ctx.lineTo(cx, bottomY - 28);
    ctx.lineTo(cx + 11, bottomY - 10);
    ctx.lineTo(cx + 28, bottomY - 22);
    ctx.lineTo(cx + 24, bottomY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, bottomY - 28, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 28, bottomY - 22, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 28, bottomY - 22, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function generateLeaderboardImage({ title, subtitle, list }) {
    if (!createCanvas) return null;

    const W = 900;
    const extraRows = Math.min(Math.max(list.length - 3, 0), 7);
    const H = extraRows > 0 ? 640 + extraRows * 68 + 75 : 700;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#071321');
    bgGrad.addColorStop(0.5, '#0c2330');
    bgGrad.addColorStop(1, '#062c25');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const glow1 = ctx.createRadialGradient(450, 260, 20, 450, 260, 320);
    glow1.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
    glow1.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, W, 600);

    const glow2 = ctx.createRadialGradient(800, 80, 10, 800, 80, 220);
    glow2.addColorStop(0, 'rgba(251, 191, 36, 0.16)');
    glow2.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(500, 0, 400, 350);

    drawRoundRect(ctx, 22, 22, W - 44, H - 44, 28);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const pillW = 360;
    const pillX = (W - pillW) / 2;
    drawRoundRect(ctx, pillX, 46, pillW, 38, 19);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(title.toUpperCase(), W / 2, 71);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('Class 10 Computer Toppers', W / 2, 124);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 18px sans-serif';
    ctx.fillText(subtitle, W / 2, 156);

    const podiumConfigs = [
        {
            rank: 2, entry: list[1] || null, cx: 185, avatarY: 322, avatarR: 38,
            boxX: 70, boxY: 406, boxW: 230, boxH: 150,
            accent: '#cbd5e1', gradTop: '#475569', gradBot: '#1e293b', badgeText: '#0f172a'
        },
        {
            rank: 1, entry: list[0] || null, cx: 450, avatarY: 274, avatarR: 46,
            boxX: 325, boxY: 366, boxW: 250, boxH: 190,
            accent: '#fbbf24', gradTop: '#b45309', gradBot: '#451a03', badgeText: '#1c1917'
        },
        {
            rank: 3, entry: list[2] || null, cx: 715, avatarY: 342, avatarR: 38,
            boxX: 600, boxY: 426, boxW: 230, boxH: 130,
            accent: '#fb923c', gradTop: '#7c2d12', gradBot: '#29150e', badgeText: '#1c1917'
        }
    ];

    for (const p of podiumConfigs) {
        if (p.rank === 1 && p.entry) drawCrown(ctx, p.cx, p.avatarY - p.avatarR - 10);

        const pGrad = ctx.createLinearGradient(p.boxX, p.boxY, p.boxX, p.boxY + p.boxH);
        pGrad.addColorStop(0, p.gradTop);
        pGrad.addColorStop(1, p.gradBot);
        drawRoundRect(ctx, p.boxX, p.boxY, p.boxW, p.boxH, 20);
        ctx.fillStyle = pGrad;
        ctx.fill();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = p.rank === 1 ? 2.5 : 1.8;
        ctx.stroke();

        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.font = 'bold 96px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(p.rank), p.cx, p.boxY + p.boxH - 18);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.cx, p.avatarY, p.avatarR, 0, Math.PI * 2);
        ctx.fillStyle = p.entry ? '#0f172a' : 'rgba(255,255,255,0.06)';
        ctx.fill();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = p.rank === 1 ? 4 : 3;
        ctx.stroke();

        ctx.fillStyle = p.entry ? '#ffffff' : '#64748b';
        ctx.font = `bold ${p.rank === 1 ? 28 : 22}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.entry ? getInitials(p.entry.name) : '--', p.cx, p.avatarY + (p.rank === 1 ? 10 : 8));
        ctx.restore();

        const bY = p.avatarY + p.avatarR + 2;
        ctx.beginPath();
        ctx.arc(p.cx, bY, p.rank === 1 ? 17 : 15, 0, Math.PI * 2);
        ctx.fillStyle = p.accent;
        ctx.fill();
        ctx.fillStyle = p.badgeText;
        ctx.font = `bold ${p.rank === 1 ? 16 : 14}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`#${p.rank}`, p.cx, bY + 5);

        ctx.textAlign = 'center';
        if (p.entry) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${p.rank === 1 ? 22 : 19}px sans-serif`;
            ctx.fillText(fitText(ctx, p.entry.name, p.boxW - 24), p.cx, p.boxY + 42);

            const sPillW = 128;
            const sPillH = 34;
            const sPillY = p.boxY + (p.rank === 1 ? 66 : 58);
            drawRoundRect(ctx, p.cx - sPillW / 2, sPillY, sPillW, sPillH, 17);
            ctx.fillStyle = 'rgba(0,0,0,0.38)';
            ctx.fill();
            ctx.fillStyle = p.accent;
            ctx.font = 'bold 19px sans-serif';
            ctx.fillText(`${p.entry.correct} / ${p.entry.attempted}`, p.cx, sPillY + 24);

            ctx.fillStyle = '#e2e8f0';
            ctx.font = '600 14px sans-serif';
            ctx.fillText(`${p.entry.accuracy}% Correct`, p.cx, sPillY + 56);
        } else {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '600 17px sans-serif';
            ctx.fillText('No Entry Yet', p.cx, p.boxY + 65);
        }
    }

    const rest = list.slice(3, 10);
    if (rest.length > 0) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('OTHER TOP PERFORMERS', 60, 608);

        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(275, 603);
        ctx.lineTo(840, 603);
        ctx.stroke();

        rest.forEach((item, idx) => {
            const rankNum = idx + 4;
            const rowY = 626 + idx * 68;
            const rowX = 58;
            const rowW = 784;
            const rowH = 56;

            drawRoundRect(ctx, rowX, rowY, rowW, rowH, 15);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.065)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.fillStyle = '#cbd5e1';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(`#${rankNum}`, rowX + 34, rowY + 34);

            ctx.beginPath();
            ctx.arc(rowX + 86, rowY + 28, 19, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(getInitials(item.name), rowX + 86, rowY + 33);

            ctx.textAlign = 'left';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 19px sans-serif';
            ctx.fillText(fitText(ctx, item.name, 310), rowX + 122, rowY + 35);

            const barX = rowX + 455;
            const barY = rowY + 24;
            const barW = 150;
            const barH = 9;
            drawRoundRect(ctx, barX, barY, barW, barH, 5);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fill();
            const fillW = Math.max(Math.round((item.accuracy / 100) * barW), 8);
            drawRoundRect(ctx, barX, barY, fillW, barH, 5);
            ctx.fillStyle = '#10b981';
            ctx.fill();

            ctx.textAlign = 'left';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '600 13px sans-serif';
            ctx.fillText(`${item.accuracy}%`, barX + barW + 10, rowY + 33);

            const scW = 92;
            const scX = rowX + rowW - scW - 14;
            drawRoundRect(ctx, scX, rowY + 12, scW, 32, 16);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#34d399';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(`${item.correct}/${item.attempted}`, scX + scW / 2, rowY + 34);
        });
    } else {
        drawRoundRect(ctx, 70, 588, 760, 54, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 17px sans-serif';
        ctx.fillText(
            list.length === 0
                ? 'Abhi tak koi vote nahi aaya hai — Poll mein vote karke top par aayein!'
                : 'Roz MCQ Polls attempt karein aur Leaderboard mein apni jagah banayein!',
            W / 2,
            621
        );
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '600 15px sans-serif';
    ctx.fillText('This web is made by Arpit  •  Class 10 UP Board Computer', W / 2, H - 38);

    return canvas.toBuffer('image/png');
}

function buildLeaderboardTextFallback({ title, subtitle, list }) {
    if (list.length === 0) return `🏆 *${title}*\n(${subtitle})\n\nAbhi tak koi vote record nahi hua hai.`;
    const medals = ['🥇', '🥈', '🥉'];
    let txt = `🏆 *${title}*\n_${subtitle}_\n\n`;
    list.slice(0, 10).forEach((item, idx) => {
        const badge = idx < 3 ? medals[idx] : `*#${idx + 1}*`;
        txt += `${badge} *${item.name}* — ${item.correct}/${item.attempted} (${item.accuracy}%)\n`;
    });
    return txt.trim();
}

async function sendLeaderboardToGroup(period = 'daily', dayMode = 'yesterday', forceSendIfEmpty = false) {
    try {
        const data = getRankedEntries(period, dayMode);
        if (data.list.length === 0 && !forceSendIfEmpty) {
            addLog(`ℹ️ ${data.title} ke liye koi votes nahi mile, image skip ki.`);
            return false;
        }

        const targetGroup = await getTargetGroup();

        if (period === 'daily' && dayMode === 'yesterday') {
            const yDate = getYesterdayIST();
            for (const p of Object.values(leaderboard.polls)) {
                if (p.dateIST === yDate) p.locked = true;
            }
            saveLeaderboard();
        }

        const imgBuf = generateLeaderboardImage(data);
        const top1 = data.list[0];
        const top2 = data.list[1];
        const top3 = data.list[2];

        let caption = period === 'weekly'
            ? `🏆 *WEEKLY CHAMPIONS LEADERBOARD* 🏆\n_${data.subtitle}_\n\n`
            : `🏆 *${data.title}* 🏆\n_${data.subtitle}_\n\n`;

        if (top1) caption += `🥇 *1st:* ${top1.name} (${top1.correct}/${top1.attempted})\n`;
        if (top2) caption += `🥈 *2nd:* ${top2.name} (${top2.correct}/${top2.attempted})\n`;
        if (top3) caption += `🥉 *3rd:* ${top3.name} (${top3.correct}/${top3.attempted})\n`;
        if (!top1) caption += `Abhi koi vote nahi mila hai.\n`;
        caption += `\n👏 Sabhi winners ko badhai! Agle quiz ke liye ready rahein.`;

        if (imgBuf) {
            await globalSock.sendMessage(targetGroup.id, {
                image: imgBuf,
                caption: caption.trim()
            });
            addLog(`🖼️ ${data.title} PNG image "${settings.groupName}" group mein bhej di gayi!`);
        } else {
            await globalSock.sendMessage(targetGroup.id, {
                text: buildLeaderboardTextFallback(data)
            });
            addLog(`⚠️ Canvas package missing — Text leaderboard bheja gaya.`);
        }
        return true;
    } catch (err) {
        addLog(`❌ Leaderboard send error: ${err.message}`);
        return false;
    }
}

// ==========================================
// Poll Vote Decryption & First-Vote Lock
// ==========================================
function matchOptionFromHashes(selectedHashes, options) {
    if (!Array.isArray(selectedHashes) || selectedHashes.length === 0) return '';
    const optionMap = new Map();
    for (const opt of options) {
        const hex = crypto.createHash('sha256').update(Buffer.from(opt, 'utf8')).digest('hex');
        optionMap.set(hex, opt);
    }
    for (const h of selectedHashes) {
        const hex = Buffer.from(h).toString('hex');
        if (optionMap.has(hex)) return optionMap.get(hex);
    }
    return '';
}

function handlePollVoteMessage(msg) {
    try {
        const pollUpdate = msg.message?.pollUpdateMessage;
        if (!pollUpdate || !pollUpdate.vote) return;

        const pollMsgId = pollUpdate.pollCreationMessageKey?.id;
        if (!pollMsgId) return;

        const poll = leaderboard.polls[pollMsgId];
        if (!poll || !poll.encKeyBase64) return;

        if (poll.locked) {
            addLog(`🔒 Answer key ja chuki hai, late vote ignore kiya (${msg.pushName || 'Student'}).`);
            return;
        }

        if (typeof baileys.decryptPollVote !== 'function') return;

        const pollEncKey = Buffer.from(poll.encKeyBase64, 'base64');

        const creatorCandidates = [...new Set([
            poll.creatorJid,
            poll.creatorLid,
            normJid(globalSock?.user?.id),
            normJid(globalSock?.user?.lid)
        ].filter(Boolean))];

        const voterCandidates = [...new Set([
            normJid(msg.key?.participant),
            normJid(msg.key?.participantAlt),
            normJid(msg.key?.remoteJid)
        ].filter(Boolean))];

        let decrypted = null;
        for (const cJid of creatorCandidates) {
            for (const vJid of voterCandidates) {
                try {
                    const out = baileys.decryptPollVote(pollUpdate.vote, {
                        pollCreatorJid: cJid,
                        pollMsgId,
                        pollEncKey,
                        voterJid: vJid
                    });
                    if (out && Array.isArray(out.selectedOptions)) {
                        decrypted = out;
                        break;
                    }
                } catch (e) {}
            }
            if (decrypted) break;
        }

        if (!decrypted) {
            addLog('⚠️ Poll vote decrypt nahi ho paya (session/LID mismatch).');
            return;
        }

        const chosenOption = matchOptionFromHashes(decrypted.selectedOptions, poll.options);
        if (!chosenOption) return;

        const pnJid = voterCandidates.find(j => j.endsWith('@s.whatsapp.net')) || '';
        const rawParticipant = normJid(msg.key?.participant || msg.key?.participantAlt || msg.key?.remoteJid);
        const voterId = pnJid || voterCandidates[0];
        if (!voterId) return;

        const studentName = formatDisplayName(voterId, msg.pushName);
        if (msg.pushName && msg.pushName.trim()) {
            leaderboard.names[voterId] = msg.pushName.trim();
        }

        if (poll.votes[voterId]) {
            addLog(`🔒 ${studentName} ne vote change kiya — 1st vote locked hai, count nahi hua.`);
            return;
        }

        const isCorrect =
            normalizeAnswerText(chosenOption) === normalizeAnswerText(poll.answer);

        poll.votes[voterId] = {
            name: studentName,
            option: chosenOption,
            isCorrect,
            at: Date.now()
        };

        const dKey = poll.dateIST || getTodayIST();
        if (!leaderboard.daily[dKey]) leaderboard.daily[dKey] = {};
        if (!leaderboard.daily[dKey][voterId]) {
            leaderboard.daily[dKey][voterId] = { name: studentName, correct: 0, attempted: 0 };
        }
        leaderboard.daily[dKey][voterId].name = studentName;
        leaderboard.daily[dKey][voterId].attempted += 1;
        if (isCorrect) leaderboard.daily[dKey][voterId].correct += 1;

        const wKey = poll.weekKey || getCurrentWeekIST();
        if (!leaderboard.weekly[wKey]) leaderboard.weekly[wKey] = {};
        if (!leaderboard.weekly[wKey][voterId]) {
            leaderboard.weekly[wKey][voterId] = { name: studentName, correct: 0, attempted: 0 };
        }
        leaderboard.weekly[wKey][voterId].name = studentName;
        leaderboard.weekly[wKey][voterId].attempted += 1;
        if (isCorrect) leaderboard.weekly[wKey][voterId].correct += 1;

        saveLeaderboard();
        addLog(`🗳️ ${studentName} ne vote lock kiya (${isCorrect ? '✅ Sahi' : '❌ Galat'})`);

        // 1-Minute Anti-Cheat Timer track karein
        const mentionJid = pnJid || rawParticipant || voterId;
        const dmJid = pnJid || rawParticipant || voterId;
        trackAntiCheatOnVote(poll, voterId, studentName, mentionJid, dmJid);
    } catch (err) {
        addLog(`⚠️ Vote track error: ${err.message}`);
    }
}

function getBatchUniqueVoters(batch) {
    const voters = new Set();
    for (const pid of (batch.pollIds || [])) {
        const p = leaderboard.polls[pid];
        if (p && p.votes) {
            for (const vId of Object.keys(p.votes)) voters.add(vId);
        }
    }
    return voters.size;
}

async function sendBatchAnswerKey(batch) {
    try {
        clearBatchAntiCheatTimers(batch.id);
        const polls = (batch.pollIds || [])
            .map(id => leaderboard.polls[id])
            .filter(Boolean);
        if (polls.length === 0) {
            batch.answerSent = true;
            saveLeaderboard();
            return;
        }

        const batchScores = {};
        for (const p of polls) {
            p.locked = true;
            for (const [vId, v] of Object.entries(p.votes || {})) {
                if (!batchScores[vId]) batchScores[vId] = { name: v.name, correct: 0, attempted: 0 };
                batchScores[vId].attempted += 1;
                if (v.isCorrect) batchScores[vId].correct += 1;
            }
        }

        let ansMsg = `✅ *Poll Quiz Answer Key* (${batch.label})\n🔒 _Votes ab lock ho gaye hain_\n\n`;
        polls.forEach((p, idx) => {
            ansMsg += `*${idx + 1}.* ${p.question}\n👉 *Sahi Answer:* ${p.answer}`;
            if (p.explanation) ansMsg += `\n💡 ${p.explanation}`;
            ansMsg += `\n\n`;
        });

        const rankedBatch = Object.values(batchScores).sort((a, b) => b.correct - a.correct);
        if (rankedBatch.length > 0) {
            ansMsg += `📊 *Is Quiz ke Toppers (${rankedBatch.length} students ne attempt kiya):*\n`;
            rankedBatch.slice(0, 3).forEach((s, i) => {
                const m = ['🥇', '🥈', '🥉'][i];
                ansMsg += `${m} *${s.name}* — ${s.correct}/${polls.length}\n`;
            });
        }

        await sendToGroup(ansMsg.trim());
        batch.answerSent = true;
        saveLeaderboard();
        addLog(`✅ Delayed Answer Key "${settings.groupName}" group mein bhej di gayi! (${rankedBatch.length} attempts)`);
    } catch (err) {
        addLog(`❌ Answer key send error: ${err.message}`);
    }
}

async function checkPendingAnswerKeys() {
    if (!isLinked) return;
    const now = Date.now();
    for (const batch of leaderboard.batches) {
        if (batch.answerSent) continue;
        const elapsedMins = (now - batch.createdAt) / 60000;
        const delayMins = Number(batch.delayMins) || 90;
        const minAttempts = Number(batch.minAttempts) || 1;
        const voterCount = getBatchUniqueVoters(batch);

        if (elapsedMins >= delayMins) {
            if (voterCount >= minAttempts || elapsedMins >= delayMins + 60) {
                await sendBatchAnswerKey(batch);
            } else if (!batch.waitLogged) {
                batch.waitLogged = true;
                saveLeaderboard();
                addLog(`⏳ Answer Key ready (${batch.label}), lekin abhi ${voterCount}/${minAttempts} attempts hain — thoda aur wait kar raha hu...`);
            }
        }
    }
}

// ==========================================
// Auto-Course Progression (Chapter & Topic)
// ==========================================
function getProgressChapterList() {
    if (settings.progressScope === 'selected') {
        const filtered = SYLLABUS.filter(ch => settings.selectedChapters.includes(ch.id));
        if (filtered.length > 0) return filtered;
    }
    return SYLLABUS;
}

function getProgressSnapshot(customChapterId, customTopicIndex) {
    const list = getProgressChapterList();
    const targetChId = String(customChapterId !== undefined ? customChapterId : settings.progressChapterId);
    let chIdx = list.findIndex(ch => ch.id === targetChId);
    if (chIdx === -1) chIdx = 0;

    const chapter = list[chIdx];
    const isChapterMode = settings.progressUnit !== 'topic';
    let tIdx = parseInt(customTopicIndex !== undefined ? customTopicIndex : settings.progressTopicIndex, 10);
    if (isNaN(tIdx) || tIdx < 0 || tIdx >= chapter.topics.length) tIdx = 0;

    let totalCourseTopics = 0;
    let currentOverallNum = 0;
    for (let i = 0; i < list.length; i++) {
        if (i < chIdx) currentOverallNum += list[i].topics.length;
        else if (i === chIdx) currentOverallNum += (tIdx + 1);
        totalCourseTopics += list[i].topics.length;
    }

    let nextChIdx = chIdx;
    let nextTIdx = tIdx;
    let willSwitchChapter = false;
    let willWrapCourse = false;

    if (isChapterMode) {
        willSwitchChapter = true;
        nextChIdx = chIdx + 1;
        if (nextChIdx >= list.length) { nextChIdx = 0; willWrapCourse = true; }
        nextTIdx = 0;
    } else {
        nextTIdx = tIdx + 1;
        if (nextTIdx >= chapter.topics.length) {
            willSwitchChapter = true;
            nextChIdx = chIdx + 1;
            if (nextChIdx >= list.length) { nextChIdx = 0; willWrapCourse = true; }
            nextTIdx = 0;
        }
    }

    const nextChapter = list[nextChIdx];
    const nextTopic = nextChapter.topics[nextTIdx];

    return {
        isChapterMode,
        list,
        chIdx,
        totalChapters: list.length,
        chapter,
        topicIndex: tIdx,
        topic: chapter.topics[tIdx],
        totalTopics: chapter.topics.length,
        chapterPercent: isChapterMode
            ? Math.round(((chIdx + 1) / list.length) * 100)
            : Math.round(((tIdx + 1) / chapter.topics.length) * 100),
        currentOverallNum,
        totalCourseTopics,
        coursePercent: isChapterMode
            ? Math.round(((chIdx + 1) / list.length) * 100)
            : Math.round((currentOverallNum / Math.max(totalCourseTopics, 1)) * 100),
        nextChapter,
        nextTopicIndex: nextTIdx,
        nextTopic,
        willSwitchChapter,
        willWrapCourse
    };
}

function moveProgressForward(resetDate = false) {
    const snap = getProgressSnapshot();
    settings.progressChapterId = snap.nextChapter.id;
    settings.progressTopicIndex = snap.nextTopicIndex;
    if (resetDate) settings.progressLastStudyDate = '';
    saveConfig();
    addLog(snap.isChapterMode
        ? `⏭️ Next Chapter set: ${snap.nextChapter.name}`
        : `⏭️ Next Topic set: ${snap.nextChapter.name} -> ${snap.nextTopic}`);
    return snap;
}

function moveProgressBackward() {
    const snap = getProgressSnapshot();
    let prevChIdx = snap.chIdx;
    let prevTIdx = 0;

    if (snap.isChapterMode) {
        prevChIdx = snap.chIdx - 1;
        if (prevChIdx < 0) prevChIdx = snap.list.length - 1;
    } else {
        prevTIdx = snap.topicIndex - 1;
        if (prevTIdx < 0) {
            prevChIdx = snap.chIdx - 1;
            if (prevChIdx < 0) prevChIdx = snap.list.length - 1;
            prevTIdx = snap.list[prevChIdx].topics.length - 1;
        }
    }

    const prevCh = snap.list[prevChIdx];
    settings.progressChapterId = prevCh.id;
    settings.progressTopicIndex = prevTIdx;
    settings.progressLastStudyDate = '';
    saveConfig();
    addLog(snap.isChapterMode
        ? `⏮️ Pichle chapter par gaye: ${prevCh.name}`
        : `⏮️ Pichle topic par gaye: ${prevCh.name} -> ${prevCh.topics[prevTIdx]}`);
}

// ==========================================
// WhatsApp Session & Group Helpers
// ==========================================
function clearSession() {
    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) {}
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
            globalSock.ev.removeAllListeners('messages.upsert');
            globalSock.end();
        } catch (e) {}
        globalSock = null;
    }
}

function restartBot(delayMs = 2000) {
    stopCurrentSocket();
    reconnectTimer = setTimeout(() => { startBot(); }, delayMs);
}

async function refreshGroups() {
    if (!globalSock || !isLinked) return;
    try {
        const groups = await globalSock.groupFetchAllParticipating();
        const list = Object.values(groups);
        availableGroups = list.map(g => g.subject).filter(Boolean);
        const match = list.find(
            g => g.subject && g.subject.trim().toLowerCase() === settings.groupName.trim().toLowerCase()
        );
        targetGroupId = match ? match.id : '';
    } catch (e) {}
}

async function getTargetGroup() {
    if (!globalSock || !isLinked) throw new Error('Bot abhi WhatsApp se connect nahi hai!');
    const groups = await globalSock.groupFetchAllParticipating();
    const list = Object.values(groups);
    availableGroups = list.map(g => g.subject).filter(Boolean);

    const targetGroup = list.find(
        (g) => g.subject && g.subject.trim().toLowerCase() === settings.groupName.trim().toLowerCase()
    );
    if (!targetGroup) {
        targetGroupId = '';
        throw new Error(`Group "${settings.groupName}" nahi mila! Available groups: ${availableGroups.join(', ') || 'None'}`);
    }
    targetGroupId = targetGroup.id;
    return targetGroup;
}

async function sendToGroup(text) {
    const targetGroup = await getTargetGroup();
    await globalSock.sendMessage(targetGroup.id, { text });
}

// ==========================================
// Auto-Detect Working Gemini Model
// ==========================================
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

        if (valid.length > 0) return { apiVer, models: valid };
    }
    throw new Error(`Koi working model nahi mila (${lastErr || 'Empty list'})`);
}

async function generateWithAutoGemini(apiKey, prompt, systemInstruction) {
    const { apiVer, models } = await fetchWorkingModels(apiKey);

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
            contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\n${prompt}` }] }],
            generationConfig: { maxOutputTokens: 8192 }
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

// ==========================================
// Syllabus Scope & AI Content / Poll Sender
// ==========================================
function buildSyllabusScope(chapterIds, specificTopic, courseMeta = null) {
    const ids = Array.isArray(chapterIds) && chapterIds.length > 0
        ? chapterIds
        : settings.selectedChapters;

    const chosen = SYLLABUS.filter(ch => ids.includes(ch.id));
    const finalList = chosen.length > 0 ? chosen : SYLLABUS;

    const chapterSummary = finalList
        .map(ch => `${ch.name} [Topics: ${ch.topics.join(', ')}]`)
        .join('\n');

    const cleanTopic = (specificTopic || '').trim();
    const label = cleanTopic
        ? `${cleanTopic} (${finalList.map(c => 'Ch ' + c.id).join(', ')})`
        : finalList.map(c => 'Ch ' + c.id).join(', ');

    let courseNote = '';
    if (courseMeta) {
        courseNote = courseMeta.isChapterMode
            ? `\nAuto-Course Chapter: ${courseMeta.chapterName} (Complete Chapter).`
            : `\nAuto-Course Topic: ${courseMeta.chapterName} -> Topic ${courseMeta.topicNum}/${courseMeta.totalTopics}: "${cleanTopic}".`;
    }

    const scopeInstruction = cleanTopic
        ? `STRICT TOPIC RULE: Sirf aur sirf is exact topic par focus karo -> "${cleanTopic}". Bahar ke topic se kuch mat likhna.${courseNote}\nReference Syllabus:\n${chapterSummary}`
        : `STRICT CHAPTER RULE: Sirf neeche diye gaye selected chapters aur unke topics ke andar se hi questions/content banao (bahar ke chapter se kuch mat lena):${courseNote}\n${chapterSummary}`;

    return { label, scopeInstruction };
}

function parsePollJSON(rawText) {
    let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        cleaned = cleaned.slice(startIdx, endIdx + 1);
    }
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Poll JSON array nahi mila.');

    return parsed
        .map(item => {
            const question = String(item.question || '').trim().slice(0, 240);
            const rawOpts = Array.isArray(item.options) ? item.options : [];
            const uniqueOpts = [];
            for (const o of rawOpts) {
                const s = String(o || '').trim().slice(0, 95);
                if (s && !uniqueOpts.includes(s)) uniqueOpts.push(s);
            }
            let answer = String(item.answer || '').trim();
            const matchedOpt = uniqueOpts.find(
                o => normalizeAnswerText(o) === normalizeAnswerText(answer)
            );
            if (matchedOpt) answer = matchedOpt;

            return {
                question,
                options: uniqueOpts.slice(0, 4),
                answer,
                explanation: String(item.explanation || '').trim()
            };
        })
        .filter(p => p.question && p.options.length >= 2);
}

function buildCourseHeader(courseMeta, specificTopic, subtitle) {
    if (!courseMeta) return '';
    let h = courseMeta.isNewChapter ? `🎉 *Naya Chapter Shuru!* 🎉\n` : '';
    h += `📚 *${courseMeta.chapterName}*\n`;
    if (!courseMeta.isChapterMode && specificTopic) {
        h += `🎯 *Topic (${courseMeta.topicNum}/${courseMeta.totalTopics}):* ${specificTopic}\n`;
    }
    if (subtitle) h += `${subtitle}\n`;
    return h;
}

async function sendAIContent({
    chapterIds,
    specificTopic = '',
    type,
    count = 3,
    shortCount = 3,
    longCount = 1,
    courseMeta = null
}) {
    try {
        const apiKey = getActiveApiKey();
        if (!apiKey) {
            throw new Error('Gemini API Key set nahi hai! Render Environment ya Web Setup mein key dalein.');
        }

        const safeCount = clampInt(count, 1, 25, 3);
        const safeShort = clampInt(shortCount, 0, 15, 3);
        const safeLong = clampInt(longCount, 0, 10, 1);
        const { label, scopeInstruction } = buildSyllabusScope(chapterIds, specificTopic, courseMeta);

        if (type === 'Short + Long Q&A (Combo)') {
            const finalShort = (safeShort === 0 && safeLong === 0) ? 2 : safeShort;
            const finalLong = (safeShort === 0 && safeLong === 0) ? 1 : safeLong;
            addLog(`⏳ AI se ${finalShort} Short + ${finalLong} Long Q&A bana raha hu [${label}]...`);

            if (finalShort > 0) {
                const shortPrompt = `${scopeInstruction}

Class 10 UP Board Computer Science exam ke liye exact ${finalShort} bahut important *Short Answer Questions (2 se 4 marks)* aur unke clear, point-wise answers likho simple Hindi/Hinglish mein.
Format:
❓ *Important Short Questions & Answers (${finalShort} Qs)*
*Q1.* [Board exam short question]
*Ans:* [Clear short answer]`;

                let shortText = await generateWithAutoGemini(apiKey, shortPrompt, settings.aiNature);
                const hdr = buildCourseHeader(courseMeta, specificTopic, '📝 *Part 1: Short Q&A*');
                if (hdr) shortText = hdr + '\n' + shortText;
                await sendToGroup(shortText);
                addLog(`✅ ${finalShort} Short Q&A "${settings.groupName}" mein bhej diye gaye!`);
            }

            if (finalLong > 0) {
                if (finalShort > 0) await sleep(2000);
                const longPrompt = `${scopeInstruction}

Class 10 UP Board Computer Science exam ke liye exact ${finalLong} bahut important *Long Answer Question (5 se 6 marks)* aur uska heading/bullet-point wise complete board-exam answer (example/code ke saath agar relevant ho) likho simple Hindi/Hinglish mein.
Format:
📄 *Important Long Questions & Answers (${finalLong} Qs)*
*Long Q1.* [Board exam long question]
*Ans:* [Detailed point-wise answer]`;

                let longText = await generateWithAutoGemini(apiKey, longPrompt, settings.aiNature);
                const hdr = finalShort === 0 ? buildCourseHeader(courseMeta, specificTopic, '📄 *Long Q&A*') : '';
                if (hdr) longText = hdr + '\n' + longText;
                await sendToGroup(longText);
                addLog(`✅ ${finalLong} Long Q&A "${settings.groupName}" mein bhej diye gaye!`);
            }
            return true;
        }

        if (type === 'WhatsApp Poll (MCQ)' || type === 'WhatsApp Poll + Auto Answer') {
            addLog(`⏳ AI se exact ${safeCount} WhatsApp Polls bana raha hu [${label}]...`);
            const pollPrompt = `${scopeInstruction}

Class 10 UP Board Computer Science exam ke liye exact ${safeCount} alag-alag aur sabse important MCQ questions banao.
Language: Simple Hindi/Hinglish.
Har question chhota aur clear rakho (max 180 characters) aur exactly 4 alag-alag options do (har option max 60 characters).
"answer" field mein exact wahi string likhna jo "options" array mein di hai.

SIRF VALID JSON ARRAY RETURN KARO, aur koi extra text mat likho. Exact JSON format:
[
  {
    "question": "Q1. [Sawal yahan]",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "answer": "Option 1",
    "explanation": "1 line mein simple reason"
  }
]`;

            const raw = await generateWithAutoGemini(apiKey, pollPrompt, settings.aiNature);
            const polls = parsePollJSON(raw);
            if (polls.length === 0) throw new Error('AI se valid Poll data nahi bana, dobara try karein.');

            const targetGroup = await getTargetGroup();
            const delayMins = clampInt(settings.answerDelayMins, 5, 480, 90);
            const minAttempts = clampInt(settings.minAttemptsForAnswer, 1, 50, 2);
            const limitText = formatLimitText(settings.pollGapLimitSecs);

            const timeHint = delayMins >= 60
                ? `${(delayMins / 60).toFixed(delayMins % 60 === 0 ? 0 : 1)} ghante`
                : `${delayMins} minute`;

            let intro = buildCourseHeader(
                courseMeta,
                specificTopic,
                `👇 *${polls.length} Important MCQ Polls — Vote karein!*`
            );
            if (!intro) {
                intro = `💻 *Class 10 Computer MCQ Quiz (${label})*\n`;
            }
            intro += `🔒 _Pehla vote hi Leaderboard mein count hoga._`;
            if (settings.antiCheatEnabled) {
                intro += `\n⏱️ _Har poll ko karne ka *${limitText}* ka samay hai (1 poll ke baad agle poll mein ${limitText} se zyada lagane par Anti-Cheat warning jayegi)._`;
            }
            if (type === 'WhatsApp Poll + Auto Answer') {
                intro += `\n⏳ _Answer Key lagbhag ${timeHint} baad bheji jayegi._`;
            }
            await globalSock.sendMessage(targetGroup.id, { text: intro.trim() });
            await sleep(1000);

            const batchId = 'b_' + Date.now();
            const todayInfo = getISTParts(0);
            const creatorJid = normJid(globalSock?.user?.id);
            const creatorLid = normJid(globalSock?.user?.lid);
            const sentPollIds = [];

            for (let i = 0; i < polls.length; i++) {
                const p = polls[i];
                const sentMsg = await globalSock.sendMessage(targetGroup.id, {
                    poll: {
                        name: p.question,
                        values: p.options,
                        selectableCount: 1
                    }
                });

                const msgId = sentMsg?.key?.id;
                if (msgId && sentMsg?.message) {
                    sentMessageCache.set(msgId, sentMsg.message);
                    if (sentMessageCache.size > 120) {
                        const firstKey = sentMessageCache.keys().next().value;
                        sentMessageCache.delete(firstKey);
                    }

                    const encKeyBuf =
                        sentMsg.message?.messageContextInfo?.messageSecret ||
                        sentMsg.message?.pollCreationMessage?.contextInfo?.messageSecret ||
                        sentMsg.message?.pollCreationMessageV3?.contextInfo?.messageSecret ||
                        null;

                    leaderboard.polls[msgId] = {
                        msgId,
                        batchId,
                        question: p.question,
                        options: p.options,
                        answer: p.answer,
                        explanation: p.explanation,
                        encKeyBase64: encKeyBuf ? Buffer.from(encKeyBuf).toString('base64') : '',
                        creatorJid,
                        creatorLid,
                        dateIST: todayInfo.dateStr,
                        weekKey: todayInfo.weekKey,
                        locked: false,
                        votes: {}
                    };
                    sentPollIds.push(msgId);
                }
                if (i < polls.length - 1) await sleep(1500);
            }

            if (sentPollIds.length > 0) {
                const autoAns = type === 'WhatsApp Poll + Auto Answer';
                leaderboard.batches.push({
                    id: batchId,
                    groupId: targetGroup.id,
                    label,
                    dateIST: todayInfo.dateStr,
                    createdAt: Date.now(),
                    delayMins,
                    minAttempts,
                    answerSent: !autoAns, // Sirf MCQ mode mein auto answer off rahega, par Anti-Cheat tracking chalti rahegi
                    waitLogged: false,
                    pollIds: sentPollIds,
                    voterTrack: {}
                });
                if (autoAns) {
                    addLog(`⏱️ Answer Key scheduled: ${timeHint} baad (min ${minAttempts} attempts).`);
                }
            }

            saveLeaderboard();
            addLog(`📊 ${polls.length} WhatsApp Poll(s) "${settings.groupName}" group mein bheje gaye (Vote + 1-Min Anti-Cheat ON)!`);
            return true;
        }

        addLog(`⏳ AI se ${safeCount} "${type}" bana raha hu [${label}]...`);
        let prompt = '';
        if (type === 'Important Board Topic (Notes)') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke liye ${safeCount} sabse zaroori topic par simple, complete board-exam study notes banao Hindi/Hinglish mein.
Format:
📖 *Class 10 Computer - Important Notes*
*Topic:* [Topic ka naam]
*Kya Hai (Asaan Samajh):* [Clear bullet points]
*Example / Code (agar relevant ho):* [Chhota saaf example]
*Board Exam Tip:* [1-2 lines]`;
        } else if (type === 'Question & Answer (Short 2-4 Marks)') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke exact ${safeCount} bahut important Short Answer Questions (2 se 4 marks wale) aur unke clear, point-wise answers likho simple Hindi/Hinglish mein.`;
        } else if (type === 'Long Question & Answer (5-6 Marks)') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke exact ${safeCount} important Long Question (5-6 marks) aur uska heading/bullet-point wise complete answer likho simple Hindi/Hinglish mein.`;
        } else if (type === 'Text MCQ Quiz (With Answer)') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke exact ${safeCount} most important MCQ questions unke 4 options, sahi answer aur 1-line explanation ke saath likho.`;
        } else if (type === 'C Program / Coding Q&A') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke exact ${safeCount} important C Programming / Practical question do, uska chhota aur bilkul sahi C code aur output samjhao.`;
        } else {
            prompt = `${scopeInstruction}\n\nClass 10 UP Board Computer Science ke exact ${safeCount} important questions aur answers do.`;
        }

        let aiText = await generateWithAutoGemini(apiKey, prompt, settings.aiNature);
        const hdr = buildCourseHeader(courseMeta, specificTopic, '');
        if (hdr) aiText = hdr + '\n' + aiText;

        await sendToGroup(aiText);
        addLog(`✅ ${safeCount} "${type}" "${settings.groupName}" group mein bhej diya gaya!`);
        return true;
    } catch (err) {
        addLog(`❌ AI/Send Error: ${err.message || err}`);
        return false;
    }
}

async function handleScheduledSlot(slotLabel, type, count, shortCount, longCount) {
    if (!settings.progressEnabled) {
        addLog(`⏰ ${slotLabel} triggered (Normal Mode) -> ${type}`);
        await sendAIContent({
            chapterIds: settings.selectedChapters,
            specificTopic: settings.specificTopic,
            type,
            count,
            shortCount,
            longCount
        });
        return;
    }

    const todayIST = getTodayIST();
    let targetChapterId = settings.progressChapterId;
    let targetTopicIndex = settings.progressTopicIndex;
    let isNewChapter = false;
    let needCommitAdvance = false;

    if (settings.progressAdvanceRule === 'daily') {
        if (settings.progressLastStudyDate && settings.progressLastStudyDate !== todayIST) {
            const nextSnap = getProgressSnapshot();
            targetChapterId = nextSnap.nextChapter.id;
            targetTopicIndex = nextSnap.nextTopicIndex;
            isNewChapter = nextSnap.willSwitchChapter;
            needCommitAdvance = true;
        } else if (!settings.progressLastStudyDate && (settings.progressUnit !== 'topic' || targetTopicIndex === 0)) {
            isNewChapter = true;
        }
    } else if (!settings.progressLastStudyDate && (settings.progressUnit !== 'topic' || targetTopicIndex === 0)) {
        isNewChapter = true;
    }

    const snap = getProgressSnapshot(targetChapterId, targetTopicIndex);
    addLog(snap.isChapterMode
        ? `🚀 ${slotLabel} (Auto-Chapter) -> ${snap.chapter.name} (${type})`
        : `🚀 ${slotLabel} (Auto-Topic) -> ${snap.chapter.name} | ${snap.topic} (${type})`);

    const ok = await sendAIContent({
        chapterIds: [snap.chapter.id],
        specificTopic: snap.isChapterMode ? '' : snap.topic,
        type,
        count,
        shortCount,
        longCount,
        courseMeta: {
            isChapterMode: snap.isChapterMode,
            chapterName: snap.chapter.name,
            topicNum: snap.topicIndex + 1,
            totalTopics: snap.totalTopics,
            isNewChapter
        }
    });

    if (!ok) return;

    if (settings.progressAdvanceRule === 'daily') {
        settings.progressChapterId = snap.chapter.id;
        settings.progressTopicIndex = snap.topicIndex;
        settings.progressLastStudyDate = todayIST;
        saveConfig();
        if (needCommitAdvance && isNewChapter) {
            addLog(`📚 Auto-switch hua naye chapter par: ${snap.chapter.name}`);
        }
    } else {
        settings.progressChapterId = snap.nextChapter.id;
        settings.progressTopicIndex = snap.nextTopicIndex;
        settings.progressLastStudyDate = todayIST;
        saveConfig();
        addLog(snap.isChapterMode
            ? `⏭️ Agle slot ke liye Next Chapter set: ${snap.nextChapter.name}`
            : `⏭️ Agle slot ke liye Next Topic set: ${snap.nextChapter.name} -> ${snap.nextTopic}`);
    }
}

// ==========================================
// Modern App-Style HTML Dashboard
// ==========================================
function renderTypeOptions(selectedVal) {
    return CONTENT_TYPES.map(
        t => `<option value="${escapeHtml(t.val)}" ${selectedVal === t.val ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
    ).join('');
}

function renderChapterCheckboxes(selectedIds, prefix) {
    return SYLLABUS.map(ch => {
        const checked = selectedIds.includes(ch.id) ? 'checked' : '';
        const badge = ch.important ? '<span class="badge-imp">IMP</span>' : '';
        return `
        <label class="ch-card">
            <input type="checkbox" class="${prefix}-ch" name="chapters" value="${ch.id}" ${checked} onchange="updateTopicDropdown('${prefix}')">
            <span class="ch-text">${escapeHtml(ch.name)}</span>
            ${badge}
        </label>`;
    }).join('');
}

function formatSlotSummary(type, count, shortC, longC) {
    if (type === 'Short + Long Q&A (Combo)') return `Short: ${shortC} + Long: ${longC}`;
    return `${type} (${count})`;
}

function getDashboardHTML(activeTab = 'home', toastMsg = '') {
    const validTabs = ['home', 'rank', 'course', 'send', 'schedule', 'setup'];
    const currentTab = validTabs.includes(activeTab) ? activeTab : 'home';
    const hasKey = Boolean(getActiveApiKey());
    const keySource = settings.geminiApiKey ? 'Web' : (process.env.GEMINI_API_KEY ? 'Render' : 'Missing');
    const prog = getProgressSnapshot();
    const pendingBatches = leaderboard.batches.filter(b => !b.answerSent);
    const todayRanked = getRankedEntries('daily', 'today').list;
    const weeklyRanked = getRankedEntries('weekly').list;

    const startChapterOptions = SYLLABUS.map(
        ch => `<option value="${ch.id}" ${prog.chapter.id === ch.id ? 'selected' : ''}>${escapeHtml(ch.name)}${ch.important ? ' ⭐' : ''}</option>`
    ).join('');

    const weekdayOptions = WEEKDAYS.map(
        (d, idx) => `<option value="${idx}" ${Number(settings.weeklyRankDay) === idx ? 'selected' : ''}>${d}</option>`
    ).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Class 10 Computer Bot</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #f1f5f9;
            --card: #ffffff;
            --text: #0f172a;
            --muted: #64748b;
            --border: #e2e8f0;
            --primary: #059669;
            --primary-dark: #047857;
            --radius: 16px;
        }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 0 0 92px 0;
        }
        .app-shell { max-width: 540px; margin: 0 auto; padding: 14px 14px 20px 14px; }

        .hero {
            background: linear-gradient(135deg, #064e3b 0%, #0f766e 100%);
            color: #fff;
            border-radius: 20px;
            padding: 18px;
            margin-bottom: 14px;
            box-shadow: 0 10px 25px -5px rgba(6, 78, 59, 0.35);
            position: relative;
            overflow: hidden;
        }
        .hero::after {
            content: '';
            position: absolute;
            width: 140px;
            height: 140px;
            background: rgba(255,255,255,0.07);
            border-radius: 50%;
            top: -40px;
            right: -30px;
            pointer-events: none;
        }
        .hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .hero h1 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.3px; }
        .hero-sub { font-size: 12px; color: #a7f3d0; margin-top: 3px; font-weight: 600; }
        .status-pill {
            display: inline-flex; align-items: center; gap: 6px;
            background: rgba(255,255,255,0.16); backdrop-filter: blur(8px);
            padding: 6px 11px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap;
        }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 0 3px rgba(251,191,36,0.3); }
        .dot.live { background: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,0.35); animation: pulse 1.8s infinite; }
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.65); }
            70% { box-shadow: 0 0 0 7px rgba(52,211,153,0); }
            100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
        }
        .hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
        .stat-mini { background: rgba(255,255,255,0.12); border-radius: 12px; padding: 8px 10px; }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #a7f3d0; font-weight: 600; }
        .stat-val { font-size: 13px; font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .tab-panel { display: none; animation: fadeIn 0.2s ease; }
        .tab-panel.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        .card {
            background: var(--card); border: 1px solid var(--border);
            border-radius: var(--radius); padding: 16px; margin-bottom: 14px;
            box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
        }
        .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 8px; }
        .card-title { margin: 0; font-size: 15.5px; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 7px; }
        .pill-badge { font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 999px; background: #ecfdf5; color: #047857; white-space: nowrap; }
        .pill-badge.off { background: #fef2f2; color: #b91c1c; }

        .course-banner {
            background: linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%);
            border: 1px solid #bbf7d0; border-radius: 14px; padding: 14px; margin-bottom: 12px;
        }
        .course-ch { font-size: 11.5px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.3px; }
        .course-topic { font-size: 16px; font-weight: 800; color: #0f172a; margin: 4px 0 10px 0; line-height: 1.35; }
        .pbar-wrap { margin-bottom: 8px; }
        .pbar-meta { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 4px; }
        .pbar-track { height: 8px; background: rgba(15,23,42,0.09); border-radius: 999px; overflow: hidden; }
        .pbar-fill { height: 100%; background: linear-gradient(90deg, #10b981, #059669); border-radius: 999px; }
        .next-hint { font-size: 12px; color: #334155; background: rgba(255,255,255,0.75); padding: 8px 10px; border-radius: 10px; margin-top: 8px; border: 1px dashed #94a3b8; }

        .lb-preview-wrap {
            background: #071321;
            border-radius: 14px;
            overflow: hidden;
            margin: 10px 0;
            border: 1px solid #1e293b;
            text-align: center;
        }
        .lb-preview-wrap img { width: 100%; height: auto; display: block; }
        .seg-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
        .seg-btn {
            background: #e2e8f0; color: #334155; border: none; border-radius: 10px;
            padding: 8px 6px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .seg-btn.active { background: #059669; color: #fff; }
        .pending-box {
            background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;
            padding: 11px 12px; font-size: 12.5px; color: #78350f; margin-bottom: 10px;
        }

        label.field-lbl { display: block; font-size: 12.5px; font-weight: 700; color: #334155; margin: 11px 0 5px 0; }
        input[type="text"], input[type="number"], input[type="password"], input[type="time"], select, textarea {
            width: 100%; padding: 11px 12px; border: 1.5px solid var(--border);
            border-radius: 11px; font-family: inherit; font-size: 14px; color: var(--text); background: #f8fafc;
        }
        input:focus, select:focus, textarea:focus { outline: none; border-color: var(--primary); background: #fff; }
        textarea { resize: vertical; line-height: 1.45; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }

        .btn {
            width: 100%; min-height: 44px; padding: 10px 14px; border: none; border-radius: 12px;
            font-family: inherit; font-size: 13.5px; font-weight: 700; color: #fff; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin-top: 10px;
        }
        .btn:active { transform: scale(0.98); }
        .btn-green { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 4px 12px rgba(5,150,105,0.25); }
        .btn-blue { background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 4px 12px rgba(37,99,235,0.22); }
        .btn-orange { background: linear-gradient(135deg, #f97316, #ea580c); box-shadow: 0 4px 12px rgba(234,88,12,0.22); }
        .btn-purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); box-shadow: 0 4px 12px rgba(124,58,237,0.22); }
        .btn-red { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .btn-soft { background: #e2e8f0; color: #1e293b; min-height: 36px; font-size: 12px; padding: 7px 10px; margin-top: 6px; }
        .btn-outline { background: #fff; color: #0f172a; border: 1.5px solid var(--border); min-height: 40px; font-size: 13px; }

        .ch-list { max-height: 225px; overflow-y: auto; border: 1.5px solid var(--border); border-radius: 12px; padding: 6px; background: #f8fafc; margin-top: 6px; }
        .ch-card { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 9px; cursor: pointer; font-size: 13px; font-weight: 500; color: #1e293b; }
        .ch-card:hover { background: #e2e8f0; }
        .ch-card input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--primary); margin: 0; flex-shrink: 0; }
        .ch-text { flex: 1; }
        .badge-imp { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 6px; }
        .slot-card { background: #f8fafc; border: 1.5px solid var(--border); border-radius: 14px; padding: 13px; margin-bottom: 12px; }
        .slot-head { display: flex; align-items: center; justify-content: space-between; font-weight: 800; font-size: 14px; color: #0f172a; margin-bottom: 6px; }

        .auth-box { text-align: center; background: #fffbeb; border: 1.5px dashed #f59e0b; border-radius: 16px; padding: 16px; margin-bottom: 14px; }
        .pairing-code { font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #b91c1c; background: #fee2e2; padding: 14px; border-radius: 12px; margin: 10px 0; border: 1px solid #fecaca; }
        .qr-frame { display: inline-block; background: #fff; padding: 10px; border-radius: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.08); margin: 8px 0; }

        .chips-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
        .chip { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .hint-txt { font-size: 11.5px; color: var(--muted); margin-top: 5px; }
        .terminal {
            background: #0f172a; color: #34d399; border-radius: 12px; padding: 12px;
            max-height: 240px; overflow-y: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11.5px; line-height: 1.55;
        }
        .log-row { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.07); word-break: break-word; }
        .log-row.err { color: #f87171; }
        .log-row.warn { color: #fbbf24; }
        .schedule-mini { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .s-tile { background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; padding: 11px; }
        .s-tile-time { font-size: 18px; font-weight: 800; color: var(--text); margin: 3px 0; }
        .s-tile-type { font-size: 11.5px; color: var(--muted); font-weight: 600; }

        .credit-footer { text-align: center; margin: 18px 0 6px 0; }
        .credit-pill {
            display: inline-flex; align-items: center; gap: 5px;
            background: rgba(15, 23, 42, 0.06); border: 1px solid rgba(15, 23, 42, 0.1);
            color: #475569; padding: 6px 14px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
        }
        .credit-pill b { color: #059669; font-weight: 800; }

        .bottom-nav {
            position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px);
            border-top: 1px solid var(--border); z-index: 100;
            padding: 6px 6px calc(8px + env(safe-area-inset-bottom));
        }
        .nav-inner { max-width: 540px; margin: 0 auto; display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; }
        .nav-btn {
            background: transparent; border: none; border-radius: 11px; padding: 6px 2px;
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
            color: var(--muted); font-family: inherit; font-size: 10px; font-weight: 700; cursor: pointer;
        }
        .nav-btn .ico { font-size: 18px; line-height: 1; }
        .nav-btn.active { background: #ecfdf5; color: var(--primary-dark); }

        .toast {
            position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
            background: #0f172a; color: #fff; padding: 11px 18px; border-radius: 999px;
            font-size: 13px; font-weight: 700; box-shadow: 0 10px 25px rgba(0,0,0,0.25);
            z-index: 999; max-width: 90%; text-align: center;
        }
    </style>
</head>
<body>
    ${toastMsg ? `<div id="toast" class="toast">${escapeHtml(toastMsg)}</div>` : ''}

    <div class="app-shell">
        <!-- Hero Header -->
        <div class="hero">
            <div class="hero-top">
                <div>
                    <h1>💻 Class 10 Computer Bot</h1>
                    <div class="hero-sub">UP Board AI Study, Polls &amp; /Ask Bot</div>
                </div>
                <div class="status-pill">
                    <span id="status-dot" class="dot ${isLinked ? 'live' : ''}"></span>
                    <span id="status-short">${isLinked ? 'Online' : 'Waiting'}</span>
                </div>
            </div>
            <div class="hero-stats">
                <div class="stat-mini">
                    <div class="stat-label">Group</div>
                    <div class="stat-val">${escapeHtml(settings.groupName)}</div>
                </div>
                <div class="stat-mini">
                    <div class="stat-label">Anti-Cheat</div>
                    <div class="stat-val">${settings.antiCheatEnabled ? '🛡️ ' + Number(settings.pollGapLimitSecs) + 's ON' : '🔴 OFF'}</div>
                </div>
                <div class="stat-mini">
                    <div class="stat-label">Weekly Votes</div>
                    <div class="stat-val">${weeklyRanked.length} Students</div>
                </div>
            </div>
        </div>

        <!-- WhatsApp Auth Card -->
        <div id="auth-box" class="auth-box" style="${isLinked ? 'display:none;' : ''}">
            <div style="font-weight:800; color:#92400e; margin-bottom:6px;" id="status-text">${escapeHtml(botStatus)}</div>
            <div id="qr-area" style="${wantPairingCode ? 'display:none;' : ''}">
                <div style="font-size:12.5px; color:#78350f; margin-bottom:6px;">WhatsApp → Linked Devices → Link a Device se scan karein</div>
                <div id="qr-container" class="qr-frame">⏳ QR Code ban raha hai...</div>
            </div>
            <div id="pairing-area" style="${!wantPairingCode ? 'display:none;' : ''}">
                <div style="font-size:12.5px; color:#78350f;">WhatsApp mein yeh 8-Digit Code dalein:</div>
                <div id="pairing-code-box" class="pairing-code">${escapeHtml(latestPairingCode || 'Generating...')}</div>
            </div>
            <form method="POST" action="/get-pairing" style="margin-top:10px; text-align:left;">
                <label class="field-lbl">WhatsApp Number (91 ke saath)</label>
                <input type="text" name="phone" value="${escapeHtml(settings.phoneNumber)}" required>
                <div class="grid-2">
                    <button type="submit" class="btn btn-orange">🔑 Pairing Code</button>
                    <button type="button" class="btn btn-blue" onclick="document.getElementById('qr-form').submit()">📷 Fresh QR</button>
                </div>
            </form>
            <form id="qr-form" method="POST" action="/get-qr" style="display:none;"></form>
        </div>

        <!-- TAB 1: HOME -->
        <div id="tab-home" class="tab-panel ${currentTab === 'home' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">🚀 Aaj ka Study Target</h3>
                    <span class="pill-badge ${settings.progressEnabled ? '' : 'off'}">${settings.progressEnabled ? (prog.isChapterMode ? 'Chapter Mode' : 'Topic Mode') : 'Manual'}</span>
                </div>
                <div class="course-banner">
                    <div class="course-ch">${prog.isChapterMode ? 'Active Chapter (' + (prog.chIdx + 1) + '/' + prog.totalChapters + ')' : escapeHtml(prog.chapter.name)}</div>
                    <div class="course-topic">${prog.isChapterMode ? escapeHtml(prog.chapter.name) : (prog.topicIndex + 1) + '. ' + escapeHtml(prog.topic)}</div>
                    <div class="pbar-wrap" style="margin-bottom:0;">
                        <div class="pbar-meta">
                            <span>Progress</span>
                            <span>${prog.coursePercent}%</span>
                        </div>
                        <div class="pbar-track"><div class="pbar-fill" style="width:${prog.coursePercent}%"></div></div>
                    </div>
                </div>
                <div class="grid-2">
                    <form method="POST" action="/send-current-course">
                        <input type="hidden" name="mode" value="qa">
                        <input type="hidden" name="fromTab" value="home">
                        <button type="submit" class="btn btn-blue" style="margin-top:0;">📚 Short+Long Q&amp;A</button>
                    </form>
                    <form method="POST" action="/send-current-course">
                        <input type="hidden" name="mode" value="poll">
                        <input type="hidden" name="fromTab" value="home">
                        <button type="submit" class="btn btn-green" style="margin-top:0;">📊 MCQ Poll (${settings.slot2Count})</button>
                    </form>
                </div>
            </div>

            ${pendingBatches.length > 0 ? `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⏳ Pending Answer Keys (${pendingBatches.length})</h3>
                </div>
                <div class="pending-box">
                    ${pendingBatches.map(b => {
                        const minsLeft = Math.max(0, Math.round((b.createdAt + b.delayMins * 60000 - Date.now()) / 60000));
                        const voters = getBatchUniqueVoters(b);
                        return `<div>• <b>${escapeHtml(b.label)}</b> — ${voters} attempts | ~${minsLeft} min bache</div>`;
                    }).join('')}
                </div>
                <form method="POST" action="/send-pending-answers">
                    <button type="submit" class="btn btn-orange" style="margin-top:0;">✅ Pending Answer Keys Abhi Bhejein</button>
                </form>
            </div>` : ''}

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⏰ Daily Auto Time Slots</h3>
                    <button type="button" class="btn-soft" style="width:auto; margin:0;" onclick="switchTab('schedule')">Edit</button>
                </div>
                <div class="schedule-mini">
                    <div class="s-tile">
                        <div style="font-size:11px; font-weight:700; color:${settings.slot1Enabled ? '#059669' : '#dc2626'};">
                            ${settings.slot1Enabled ? '🟢 SLOT 1 ON' : '🔴 SLOT 1 OFF'}
                        </div>
                        <div class="s-tile-time">${escapeHtml(settings.slot1Time)}</div>
                        <div class="s-tile-type">${escapeHtml(formatSlotSummary(settings.slot1Type, settings.slot1Count, settings.slot1ShortCount, settings.slot1LongCount))}</div>
                    </div>
                    <div class="s-tile">
                        <div style="font-size:11px; font-weight:700; color:${settings.slot2Enabled ? '#059669' : '#dc2626'};">
                            ${settings.slot2Enabled ? '🟢 SLOT 2 ON' : '🔴 SLOT 2 OFF'}
                        </div>
                        <div class="s-tile-time">${escapeHtml(settings.slot2Time)}</div>
                        <div class="s-tile-type">${escapeHtml(formatSlotSummary(settings.slot2Type, settings.slot2Count, settings.slot2ShortCount, settings.slot2LongCount))}</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">📜 Live Activity Console</h3>
                    <span style="font-size:11px; color:var(--muted); font-weight:600;">Auto-sync 3s</span>
                </div>
                <div id="logs-box" class="terminal">Loading logs...</div>
            </div>
        </div>

        <!-- TAB 2: LEADERBOARD & ANTI-CHEAT -->
        <div id="tab-rank" class="tab-panel ${currentTab === 'rank' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">🏆 Live Leaderboard Image</h3>
                    <span class="pill-badge">${createCanvas ? '🖼️ HD Image ON' : '⚠️ Update package.json'}</span>
                </div>

                <div class="seg-tabs">
                    <button type="button" class="seg-btn active" id="lb-btn-daily" onclick="loadLbPreview('daily', 'today', false)">📅 Today (${todayRanked.length})</button>
                    <button type="button" class="seg-btn" id="lb-btn-weekly" onclick="loadLbPreview('weekly', 'today', false)">🏆 Weekly (${weeklyRanked.length})</button>
                    <button type="button" class="seg-btn" id="lb-btn-demo" onclick="loadLbPreview('daily', 'today', true)">✨ Demo Look</button>
                </div>

                <div class="lb-preview-wrap">
                    ${createCanvas
                        ? `<img id="lb-img" src="/api/leaderboard-image?period=daily&day=today&t=${Date.now()}" alt="Leaderboard Preview">`
                        : `<div style="padding:20px; color:#fbbf24; font-size:13px;">Image preview ke liye GitHub par <b>package.json</b> mein <b>@napi-rs/canvas</b> add karke redeploy karein.</div>`
                    }
                </div>

                <div class="grid-2">
                    <form method="POST" action="/send-leaderboard">
                        <input type="hidden" name="period" value="daily">
                        <input type="hidden" name="day" value="today">
                        <button type="submit" class="btn btn-blue" style="margin-top:4px;">📤 Today Image Bhejein</button>
                    </form>
                    <form method="POST" action="/send-leaderboard">
                        <input type="hidden" name="period" value="weekly">
                        <button type="submit" class="btn btn-green" style="margin-top:4px;">🏆 Weekly Image Bhejein</button>
                    </form>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">🛡️ Anti-Cheat, Answer Delay &amp; Auto Winner</h3>
                </div>
                <form method="POST" action="/save-rank-settings">
                    <div class="slot-card" style="background:#fff7ed; border-color:#fed7aa;">
                        <div class="slot-head"><span>🚨 1-Minute Poll Anti-Cheat Alert</span></div>
                        <div class="grid-2">
                            <div>
                                <label class="field-lbl">Anti-Cheat Status</label>
                                <select name="antiCheatEnabled">
                                    <option value="true" ${settings.antiCheatEnabled ? 'selected' : ''}>🟢 ON</option>
                                    <option value="false" ${!settings.antiCheatEnabled ? 'selected' : ''}>🔴 OFF</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-lbl">Max Time / Poll (Seconds)</label>
                                <input type="number" name="pollGapLimitSecs" min="15" max="600" value="${Number(settings.pollGapLimitSecs)}" required>
                            </div>
                        </div>
                        <label class="field-lbl">Warning Message Kahan Jaye</label>
                        <select name="antiCheatTarget">
                            <option value="group" ${settings.antiCheatTarget === 'group' ? 'selected' : ''}>👥 Group mein (Student ka Naam + @Tag)</option>
                            <option value="dm" ${settings.antiCheatTarget === 'dm' ? 'selected' : ''}>📩 Student ke Personal DM mein</option>
                            <option value="both" ${settings.antiCheatTarget === 'both' ? 'selected' : ''}>📢 Dono Jagah (Group + Personal DM)</option>
                        </select>
                        <div class="hint-txt">1st poll ke baad next poll mein ${Number(settings.pollGapLimitSecs)} sec se zyada lagne par student ke naam ke saath cheating warning jayegi.</div>
                    </div>

                    <div class="grid-2">
                        <div>
                            <label class="field-lbl">Answer Key Delay (Minutes)</label>
                            <input type="number" name="answerDelayMins" min="5" max="480" value="${Number(settings.answerDelayMins)}" required>
                        </div>
                        <div>
                            <label class="field-lbl">Min Students Attempt</label>
                            <input type="number" name="minAttemptsForAnswer" min="1" max="50" value="${Number(settings.minAttemptsForAnswer)}" required>
                        </div>
                    </div>
                    <div class="hint-txt">Example: 60 min = 1 ghanta, 90 min = 1.5 ghanta, 120 min = 2 ghante.</div>

                    <div class="slot-card" style="margin-top:12px;">
                        <div class="slot-head"><span>🥇 Daily Winner Image (Auto)</span></div>
                        <div class="grid-2">
                            <div>
                                <label class="field-lbl">Status</label>
                                <select name="dailyRankEnabled">
                                    <option value="true" ${settings.dailyRankEnabled ? 'selected' : ''}>🟢 ON</option>
                                    <option value="false" ${!settings.dailyRankEnabled ? 'selected' : ''}>🔴 OFF</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-lbl">Time (IST)</label>
                                <input type="time" name="dailyRankTime" value="${escapeHtml(settings.dailyRankTime)}" required>
                            </div>
                        </div>
                        <label class="field-lbl">Kis Din ka Result Bheje</label>
                        <select name="dailyRankTarget">
                            <option value="yesterday" ${settings.dailyRankTarget !== 'today' ? 'selected' : ''}>🌅 Kal ka Result (Next Day Morning best)</option>
                            <option value="today" ${settings.dailyRankTarget === 'today' ? 'selected' : ''}>🌙 Aaj ka Result (Same Day Night)</option>
                        </select>
                    </div>

                    <div class="slot-card">
                        <div class="slot-head"><span>🏆 Weekly Champions Image (Auto)</span></div>
                        <div class="grid-2">
                            <div>
                                <label class="field-lbl">Status</label>
                                <select name="weeklyRankEnabled">
                                    <option value="true" ${settings.weeklyRankEnabled ? 'selected' : ''}>🟢 ON</option>
                                    <option value="false" ${!settings.weeklyRankEnabled ? 'selected' : ''}>🔴 OFF</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-lbl">Din (Day)</label>
                                <select name="weeklyRankDay">${weekdayOptions}</select>
                            </div>
                        </div>
                        <label class="field-lbl">Weekly Result Time (IST)</label>
                        <input type="time" name="weeklyRankTime" value="${escapeHtml(settings.weeklyRankTime)}" required>
                    </div>

                    <button type="submit" class="btn btn-purple">💾 Anti-Cheat &amp; Leaderboard Save Karein</button>
                </form>

                <div class="grid-2" style="margin-top:8px;">
                    <form method="POST" action="/send-pending-answers">
                        <button type="submit" class="btn btn-outline">✅ Pending Answers Now</button>
                    </form>
                    <form method="POST" action="/reset-leaderboard" onsubmit="return confirm('Kya aap sach mein Daily aur Weekly scores reset karna chahte hain?');">
                        <button type="submit" class="btn btn-red">🗑️ Reset Scores</button>
                    </form>
                </div>
            </div>
        </div>

        <!-- TAB 3: AUTO-COURSE -->
        <div id="tab-course" class="tab-panel ${currentTab === 'course' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">🚀 Auto-Course (Next-Next Mode)</h3>
                    <span class="pill-badge ${settings.progressEnabled ? '' : 'off'}">${settings.progressEnabled ? '🟢 ON' : '🔴 OFF'}</span>
                </div>
                <div class="course-banner">
                    <div class="course-ch">${prog.isChapterMode ? 'Active Chapter (' + (prog.chIdx + 1) + '/' + prog.totalChapters + ')' : escapeHtml(prog.chapter.name)}</div>
                    <div class="course-topic">${prog.isChapterMode ? escapeHtml(prog.chapter.name) : (prog.topicIndex + 1) + '. ' + escapeHtml(prog.topic)}</div>
                    <div class="pbar-wrap">
                        <div class="pbar-meta"><span>Progress</span><span>${prog.coursePercent}%</span></div>
                        <div class="pbar-track"><div class="pbar-fill" style="width:${prog.coursePercent}%"></div></div>
                    </div>
                    <div class="next-hint">
                        ⏭️ <b>Agla Switch:</b> ${prog.isChapterMode ? escapeHtml(prog.nextChapter.name) : escapeHtml(prog.nextTopic) + (prog.willSwitchChapter ? ' (' + escapeHtml(prog.nextChapter.name) + ')' : '')}
                    </div>
                </div>

                <div class="grid-2">
                    <form method="POST" action="/progress-prev">
                        <button type="submit" class="btn btn-outline" style="margin-top:0;">⏮️ Pichla ${prog.isChapterMode ? 'Chapter' : 'Topic'}</button>
                    </form>
                    <form method="POST" action="/progress-next">
                        <button type="submit" class="btn btn-outline" style="margin-top:0;">⏭️ Agla ${prog.isChapterMode ? 'Chapter' : 'Topic'}</button>
                    </form>
                </div>

                <form method="POST" action="/save-progress" style="margin-top:8px;">
                    <label class="field-lbl">Auto-Course Mode</label>
                    <select name="progressEnabled">
                        <option value="true" ${settings.progressEnabled ? 'selected' : ''}>🟢 ON — Apne aap Next-Next aage badhe</option>
                        <option value="false" ${!settings.progressEnabled ? 'selected' : ''}>🔴 OFF — Normal Selected Chapters use karein</option>
                    </select>

                    <label class="field-lbl">Aage Badhne ka Tareeka</label>
                    <select id="prog-unit-select" name="progressUnit" onchange="toggleProgTopicBox()">
                        <option value="chapter" ${settings.progressUnit !== 'topic' ? 'selected' : ''}>📚 Chapter-by-Chapter (Aaj 1 Chapter, Kal Next)</option>
                        <option value="topic" ${settings.progressUnit === 'topic' ? 'selected' : ''}>🎯 Topic-by-Topic (Topic khatam hone par Next Chapter)</option>
                    </select>

                    <div class="grid-2">
                        <div>
                            <label class="field-lbl">Course Scope</label>
                            <select name="progressScope">
                                <option value="all" ${settings.progressScope === 'all' ? 'selected' : ''}>📚 Sabhi 12 Chapters</option>
                                <option value="selected" ${settings.progressScope === 'selected' ? 'selected' : ''}>☑️ Sirf Selected</option>
                            </select>
                        </div>
                        <div>
                            <label class="field-lbl">Kab Next Ho</label>
                            <select name="progressAdvanceRule">
                                <option value="daily" ${settings.progressAdvanceRule === 'daily' ? 'selected' : ''}>📅 Roz Next (Slot 1+2 same)</option>
                                <option value="every_slot" ${settings.progressAdvanceRule === 'every_slot' ? 'selected' : ''}>⚡ Har Slot Par Next</option>
                            </select>
                        </div>
                    </div>

                    <label class="field-lbl">Starting Chapter Chunein</label>
                    <select id="prog-ch-select" name="progressChapterId" onchange="updateProgressTopics()">
                        ${startChapterOptions}
                    </select>

                    <div id="prog-topic-wrap">
                        <label class="field-lbl">Starting Topic Chunein (Sirf Topic Mode mein)</label>
                        <select id="prog-topic-select" name="progressTopicIndex"></select>
                    </div>

                    <button type="submit" class="btn btn-green">💾 Auto-Course Save Karein</button>
                </form>
            </div>
        </div>

        <!-- TAB 4: SEND NOW & CUSTOM -->
        <div id="tab-send" class="tab-panel ${currentTab === 'send' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⚡ Abhi Turant Poll / Short+Long Bhejein</h3>
                </div>
                <form method="POST" action="/send-now">
                    <label class="field-lbl" style="margin-top:0;">Chapters Select Karein</label>
                    <div class="grid-3">
                        <button type="button" class="btn btn-soft" onclick="selectChapters('now', 'all')">Sabhi 12</button>
                        <button type="button" class="btn btn-soft" onclick="selectChapters('now', 'imp')">⭐ Sirf Imp</button>
                        <button type="button" class="btn btn-soft" onclick="selectChapters('now', 'none')">Clear</button>
                    </div>
                    <div class="ch-list">${renderChapterCheckboxes(settings.selectedChapters, 'now')}</div>

                    <label class="field-lbl">Specific Topic (Optional)</label>
                    <select id="now-topic-select" name="topicSelect">
                        <option value="">-- Selected Chapters se Mix --</option>
                    </select>
                    <input type="text" name="customTopic" placeholder="Ya koi bhi topic khud type karein..." style="margin-top:7px;">

                    <label class="field-lbl">Kya Bhejna Hai</label>
                    <select id="now-type" name="type" onchange="toggleCountFields('now')">${renderTypeOptions('WhatsApp Poll + Auto Answer')}</select>

                    <div id="now-single-wrap">
                        <label class="field-lbl">Kitne Bhejne Hain (Number Type Karein: 1 se 25)</label>
                        <input type="number" name="count" min="1" max="25" value="5" required>
                    </div>

                    <div id="now-combo-wrap" class="grid-2" style="display:none;">
                        <div>
                            <label class="field-lbl">Kitne Short Q&amp;A (0–15)</label>
                            <input type="number" name="shortCount" min="0" max="15" value="3">
                        </div>
                        <div>
                            <label class="field-lbl">Kitne Long Q&amp;A (0–10)</label>
                            <input type="number" name="longCount" min="0" max="10" value="1">
                        </div>
                    </div>

                    <button type="submit" class="btn btn-green">🚀 Abhi Group Mein Bhejein</button>
                </form>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">✍️ Custom Message Bhejein</h3>
                </div>
                <form method="POST" action="/send-custom">
                    <textarea name="message" rows="3" placeholder="Apna message yahan likhein (WhatsApp *bold* bhi chalega)..." required></textarea>
                    <button type="submit" class="btn btn-blue">📤 Group Mein Send Karein</button>
                </form>
            </div>
        </div>

        <!-- TAB 5: SCHEDULE -->
        <div id="tab-schedule" class="tab-panel ${currentTab === 'schedule' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⏰ Daily Auto Schedule (IST)</h3>
                </div>
                <form method="POST" action="/save-schedule">
                    <div class="slot-card">
                        <div class="slot-head">
                            <span>🌅 Time Slot 1</span>
                            <span style="font-size:11px; color:var(--muted);">Jaise: Short + Long Q&amp;A</span>
                        </div>
                        <div class="grid-2">
                            <div>
                                <label class="field-lbl">Status</label>
                                <select name="slot1Enabled">
                                    <option value="true" ${settings.slot1Enabled ? 'selected' : ''}>🟢 ON</option>
                                    <option value="false" ${!settings.slot1Enabled ? 'selected' : ''}>🔴 OFF</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-lbl">Time 1 (IST)</label>
                                <input type="time" name="slot1Time" value="${escapeHtml(settings.slot1Time)}" required>
                            </div>
                        </div>
                        <label class="field-lbl">Slot 1 mein kya bheje</label>
                        <select id="slot1-type" name="slot1Type" onchange="toggleCountFields('slot1')">${renderTypeOptions(settings.slot1Type)}</select>

                        <div id="slot1-single-wrap">
                            <label class="field-lbl">Kitne Bhejne Hain (1–25)</label>
                            <input type="number" name="slot1Count" min="1" max="25" value="${Number(settings.slot1Count)}">
                        </div>
                        <div id="slot1-combo-wrap" class="grid-2" style="display:none;">
                            <div>
                                <label class="field-lbl">Short Q&amp;A Count</label>
                                <input type="number" name="slot1ShortCount" min="0" max="15" value="${Number(settings.slot1ShortCount)}">
                            </div>
                            <div>
                                <label class="field-lbl">Long Q&amp;A Count</label>
                                <input type="number" name="slot1LongCount" min="0" max="10" value="${Number(settings.slot1LongCount)}">
                            </div>
                        </div>
                    </div>

                    <div class="slot-card">
                        <div class="slot-head">
                            <span>🌇 Time Slot 2</span>
                            <span style="font-size:11px; color:var(--muted);">Jaise: Sirf MCQ Poll</span>
                        </div>
                        <div class="grid-2">
                            <div>
                                <label class="field-lbl">Status</label>
                                <select name="slot2Enabled">
                                    <option value="true" ${settings.slot2Enabled ? 'selected' : ''}>🟢 ON</option>
                                    <option value="false" ${!settings.slot2Enabled ? 'selected' : ''}>🔴 OFF</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-lbl">Time 2 (IST)</label>
                                <input type="time" name="slot2Time" value="${escapeHtml(settings.slot2Time)}" required>
                            </div>
                        </div>
                        <label class="field-lbl">Slot 2 mein kya bheje</label>
                        <select id="slot2-type" name="slot2Type" onchange="toggleCountFields('slot2')">${renderTypeOptions(settings.slot2Type)}</select>

                        <div id="slot2-single-wrap">
                            <label class="field-lbl">Kitne MCQ / Items Bhejein (1–25)</label>
                            <input type="number" name="slot2Count" min="1" max="25" value="${Number(settings.slot2Count)}">
                        </div>
                        <div id="slot2-combo-wrap" class="grid-2" style="display:none;">
                            <div>
                                <label class="field-lbl">Short Q&amp;A Count</label>
                                <input type="number" name="slot2ShortCount" min="0" max="15" value="${Number(settings.slot2ShortCount)}">
                            </div>
                            <div>
                                <label class="field-lbl">Long Q&amp;A Count</label>
                                <input type="number" name="slot2LongCount" min="0" max="10" value="${Number(settings.slot2LongCount)}">
                            </div>
                        </div>
                    </div>

                    <label class="field-lbl">Selected Chapters (Selected-Scope ya Normal Mode ke liye)</label>
                    <div class="grid-3">
                        <button type="button" class="btn btn-soft" onclick="selectChapters('sch', 'all')">Sabhi 12</button>
                        <button type="button" class="btn btn-soft" onclick="selectChapters('sch', 'imp')">⭐ Sirf Imp</button>
                        <button type="button" class="btn btn-soft" onclick="selectChapters('sch', 'none')">Clear</button>
                    </div>
                    <div class="ch-list">${renderChapterCheckboxes(settings.selectedChapters, 'sch')}</div>

                    <label class="field-lbl">Specific Topic (Sirf jab Auto-Course OFF ho)</label>
                    <select id="sch-topic-select" name="topicSelect">
                        <option value="">-- Selected Chapters se Mix --</option>
                    </select>
                    <input type="text" name="customTopic" value="${escapeHtml(settings.specificTopic)}" placeholder="Ya apna specific topic likhein..." style="margin-top:7px;">

                    <button type="submit" class="btn btn-blue">💾 Schedule &amp; Counts Save Karein</button>
                </form>
            </div>
        </div>

        <!-- TAB 6: SETUP -->
        <div id="tab-setup" class="tab-panel ${currentTab === 'setup' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⚙️ Bot Configuration</h3>
                </div>
                <form method="POST" action="/save-config">
                    <label class="field-lbl" style="margin-top:0;">WhatsApp Group Name</label>
                    <input id="group-name-input" type="text" name="groupName" value="${escapeHtml(settings.groupName)}" placeholder="Exact group name..." required>
                    <div id="groups-chips" class="chips-wrap"></div>
                    <div id="groups-hint" class="hint-txt">Connected hone par aapke groups yahan tap-to-select chips bankar dikhenge.</div>

                    <div class="slot-card" style="margin-top:12px;">
                        <div class="slot-head"><span>💬 /Question Instant AI Reply</span></div>
                        <div class="grid-2">
                            <div>
                                <label class="field-lbl">/Command Status</label>
                                <select name="slashAskEnabled">
                                    <option value="true" ${settings.slashAskEnabled ? 'selected' : ''}>🟢 ON (/sawal → Instant Answer)</option>
                                    <option value="false" ${!settings.slashAskEnabled ? 'selected' : ''}>🔴 OFF</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-lbl">Kahan Kaam Kare</label>
                                <select name="slashOnlyTargetGroup">
                                    <option value="true" ${settings.slashOnlyTargetGroup ? 'selected' : ''}>👥 Sirf Target Group</option>
                                    <option value="false" ${!settings.slashOnlyTargetGroup ? 'selected' : ''}>🌐 Sabhi Chats/Groups</option>
                                </select>
                            </div>
                        </div>
                        <div class="hint-txt">Example: Group mein koi likhe <b>/pointer kya hota hai</b> → Bot turant reply karega.</div>
                    </div>

                    <label class="field-lbl">Gemini API Key (${hasKey ? '🟢 Active: ' + keySource : '🔴 Missing'})</label>
                    <input type="password" name="geminiApiKey" placeholder="${hasKey ? 'Key saved hai (badalne ke liye nayi dalein)' : 'Apni Gemini API Key (AIza...) dalein'}">

                    <label class="field-lbl">Gemini Model</label>
                    <input type="text" name="geminiModel" value="${escapeHtml(settings.geminiModel)}" placeholder="auto" required>
                    <div class="hint-txt">Active detected model: <b id="detected-model">${escapeHtml(detectedWorkingModel || 'Auto-detect on next send')}</b></div>

                    <label class="field-lbl">AI Teacher Nature / System Prompt</label>
                    <textarea name="aiNature" rows="4" required>${escapeHtml(settings.aiNature)}</textarea>

                    <button type="submit" class="btn btn-purple">💾 All Settings Save Karein</button>
                </form>
            </div>
        </div>

        <!-- Website Credit Footer -->
        <div class="credit-footer">
            <span class="credit-pill">⚡ This web is made by <b>Arpit</b></span>
        </div>
    </div>

    <!-- 6-Tab Bottom Navigation -->
    <nav class="bottom-nav">
        <div class="nav-inner">
            <button type="button" class="nav-btn ${currentTab === 'home' ? 'active' : ''}" data-tab="home" onclick="switchTab('home')">
                <span class="ico">🏠</span><span>Home</span>
            </button>
            <button type="button" class="nav-btn ${currentTab === 'rank' ? 'active' : ''}" data-tab="rank" onclick="switchTab('rank')">
                <span class="ico">🏆</span><span>Rank</span>
            </button>
            <button type="button" class="nav-btn ${currentTab === 'course' ? 'active' : ''}" data-tab="course" onclick="switchTab('course')">
                <span class="ico">🚀</span><span>Course</span>
            </button>
            <button type="button" class="nav-btn ${currentTab === 'send' ? 'active' : ''}" data-tab="send" onclick="switchTab('send')">
                <span class="ico">⚡</span><span>Send</span>
            </button>
            <button type="button" class="nav-btn ${currentTab === 'schedule' ? 'active' : ''}" data-tab="schedule" onclick="switchTab('schedule')">
                <span class="ico">⏰</span><span>Time</span>
            </button>
            <button type="button" class="nav-btn ${currentTab === 'setup' ? 'active' : ''}" data-tab="setup" onclick="switchTab('setup')">
                <span class="ico">⚙️</span><span>Setup</span>
            </button>
        </div>
    </nav>

    <script>
        var SYLLABUS_DATA = ${safeJson(SYLLABUS)};
        var IMP_IDS = SYLLABUS_DATA.filter(function(c) { return c.important; }).map(function(c) { return c.id; });
        var SAVED_TOPIC = ${safeJson(settings.specificTopic || '')};
        var CURRENT_PROG_CH = ${safeJson(prog.chapter.id)};
        var CURRENT_PROG_TIDX = ${Number(prog.topicIndex)};

        var toastEl = document.getElementById('toast');
        if (toastEl) setTimeout(function() { toastEl.style.display = 'none'; }, 3200);

        function switchTab(tabName) {
            document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
            document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
            var panel = document.getElementById('tab-' + tabName);
            var btn = document.querySelector('.nav-btn[data-tab="' + tabName + '"]');
            if (panel) panel.classList.add('active');
            if (btn) btn.classList.add('active');
            if (history.replaceState) history.replaceState(null, '', '/?tab=' + encodeURIComponent(tabName));
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function loadLbPreview(period, day, isDemo) {
            document.querySelectorAll('.seg-btn').forEach(function(b) { b.classList.remove('active'); });
            var activeId = isDemo ? 'lb-btn-demo' : (period === 'weekly' ? 'lb-btn-weekly' : 'lb-btn-daily');
            var activeEl = document.getElementById(activeId);
            if (activeEl) activeEl.classList.add('active');
            var img = document.getElementById('lb-img');
            if (img) {
                img.src = '/api/leaderboard-image?period=' + encodeURIComponent(period)
                    + '&day=' + encodeURIComponent(day)
                    + (isDemo ? '&demo=1' : '')
                    + '&t=' + Date.now();
            }
        }

        function toggleCountFields(prefix) {
            var sel = document.getElementById(prefix + '-type');
            var singleWrap = document.getElementById(prefix + '-single-wrap');
            var comboWrap = document.getElementById(prefix + '-combo-wrap');
            if (!sel || !singleWrap || !comboWrap) return;
            if (sel.value === 'Short + Long Q&A (Combo)') {
                singleWrap.style.display = 'none';
                comboWrap.style.display = 'grid';
            } else {
                singleWrap.style.display = 'block';
                comboWrap.style.display = 'none';
            }
        }

        function toggleProgTopicBox() {
            var unitSel = document.getElementById('prog-unit-select');
            var wrap = document.getElementById('prog-topic-wrap');
            if (!unitSel || !wrap) return;
            wrap.style.display = unitSel.value === 'topic' ? 'block' : 'none';
        }

        function pickGroup(name) {
            var inp = document.getElementById('group-name-input');
            if (inp) { inp.value = name; inp.focus(); }
        }

        function updateProgressTopics() {
            var chSelect = document.getElementById('prog-ch-select');
            var topicSelect = document.getElementById('prog-topic-select');
            if (!chSelect || !topicSelect) return;
            var chId = chSelect.value;
            var ch = SYLLABUS_DATA.find(function(c) { return c.id === chId; }) || SYLLABUS_DATA[0];
            topicSelect.innerHTML = '';
            ch.topics.forEach(function(t, idx) {
                var opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = (idx + 1) + '. ' + t;
                if (chId === CURRENT_PROG_CH && idx === CURRENT_PROG_TIDX) opt.selected = true;
                topicSelect.appendChild(opt);
            });
        }

        function selectChapters(prefix, mode) {
            var boxes = document.querySelectorAll('.' + prefix + '-ch');
            boxes.forEach(function(b) {
                if (mode === 'all') b.checked = true;
                else if (mode === 'none') b.checked = false;
                else if (mode === 'imp') b.checked = IMP_IDS.indexOf(b.value) !== -1;
            });
            updateTopicDropdown(prefix);
        }

        function updateTopicDropdown(prefix) {
            var boxes = document.querySelectorAll('.' + prefix + '-ch:checked');
            var selectedIds = Array.prototype.map.call(boxes, function(b) { return b.value; });
            var selectEl = document.getElementById(prefix + '-topic-select');
            if (!selectEl) return;
            var prevVal = selectEl.value || (prefix === 'sch' ? SAVED_TOPIC : '');
            selectEl.innerHTML = '<option value="">-- Selected Chapters se Mix --</option>';
            SYLLABUS_DATA.forEach(function(ch) {
                if (selectedIds.indexOf(ch.id) !== -1) {
                    var grp = document.createElement('optgroup');
                    grp.label = ch.name;
                    ch.topics.forEach(function(t) {
                        var opt = document.createElement('option');
                        opt.value = t;
                        opt.textContent = t;
                        if (t === prevVal) opt.selected = true;
                        grp.appendChild(opt);
                    });
                    selectEl.appendChild(grp);
                }
            });
        }

        toggleCountFields('now');
        toggleCountFields('slot1');
        toggleCountFields('slot2');
        toggleProgTopicBox();
        updateProgressTopics();
        updateTopicDropdown('now');
        updateTopicDropdown('sch');

        var lastQrRendered = '';
        var lastGroupsKey = '';
        function updateLive() {
            fetch('/api/status')
                .then(function(r) { return r.json(); })
                .then(function(d) {
                    var statusText = document.getElementById('status-text');
                    var statusShort = document.getElementById('status-short');
                    var statusDot = document.getElementById('status-dot');
                    var authBox = document.getElementById('auth-box');

                    if (statusText) statusText.innerText = d.status;
                    if (statusShort) statusShort.innerText = d.isLinked ? 'Online' : 'Linking...';
                    if (statusDot) {
                        if (d.isLinked) statusDot.classList.add('live');
                        else statusDot.classList.remove('live');
                    }

                    if (d.detectedModel) {
                        var dm = document.getElementById('detected-model');
                        if (dm) dm.innerText = d.detectedModel;
                    }

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
                                var url = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(d.qr);
                                document.getElementById('qr-container').innerHTML = '<img src="' + url + '" style="display:block;border-radius:8px;" />';
                            } else if (!d.qr) {
                                document.getElementById('qr-container').innerText = '⏳ Naya QR Code ban raha hai...';
                            }
                        }
                    }

                    if (d.groups && d.groups.length > 0) {
                        var gKey = d.groups.join('||');
                        if (gKey !== lastGroupsKey) {
                            lastGroupsKey = gKey;
                            var chipsEl = document.getElementById('groups-chips');
                            var hintEl = document.getElementById('groups-hint');
                            if (chipsEl) {
                                chipsEl.innerHTML = '';
                                d.groups.forEach(function(g) {
                                    var btn = document.createElement('button');
                                    btn.type = 'button';
                                    btn.className = 'chip';
                                    btn.textContent = '👥 ' + g;
                                    btn.onclick = function() { pickGroup(g); };
                                    chipsEl.appendChild(btn);
                                });
                            }
                            if (hintEl) hintEl.innerText = 'Kisi bhi group chip par tap karke select karein, fir Save dabayein.';
                        }
                    }

                    var logsHtml = d.logs.length
                        ? d.logs.map(function(l) {
                            var cls = l.indexOf('❌') !== -1 ? 'err' : (l.indexOf('⚠️') !== -1 || l.indexOf('🚨') !== -1 ? 'warn' : '');
                            return '<div class="log-row ' + cls + '">' + l.replace(/</g, '&lt;') + '</div>';
                        }).join('')
                        : '<div class="log-row">Abhi koi activity nahi hai.</div>';
                    var logsBox = document.getElementById('logs-box');
                    if (logsBox) logsBox.innerHTML = logsHtml;
                })
                .catch(function() {});
        }
        updateLive();
        setInterval(updateLive, 3000);
    </script>
</body>
</html>`;
}

// ==========================================
// HTTP Server
// ==========================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = urlObj.pathname;

    if (req.method === 'GET' && pathname === '/') {
        const tab = urlObj.searchParams.get('tab') || 'home';
        const msg = urlObj.searchParams.get('msg') || '';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(getDashboardHTML(tab, msg));
    }

    if (req.method === 'GET' && pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            status: botStatus,
            isLinked,
            qr: latestQR,
            pairingCode: latestPairingCode,
            wantPairingCode,
            detectedModel: detectedWorkingModel,
            groups: availableGroups,
            logs: activityLogs
        }));
    }

    if (req.method === 'GET' && pathname === '/api/leaderboard-image') {
        const period = urlObj.searchParams.get('period') === 'weekly' ? 'weekly' : 'daily';
        const day = urlObj.searchParams.get('day') === 'yesterday' ? 'yesterday' : 'today';
        const isDemo = urlObj.searchParams.get('demo') === '1';

        const data = isDemo ? getDemoEntries(period) : getRankedEntries(period, day);
        const buf = generateLeaderboardImage(data);
        if (!buf) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            return res.end('Canvas module not installed');
        }
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store'
        });
        return res.end(buf);
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const params = new URLSearchParams(body);
            let redirectTab = 'home';
            let toast = '';

            if (pathname === '/save-rank-settings') {
                settings.antiCheatEnabled = params.get('antiCheatEnabled') !== 'false';
                settings.pollGapLimitSecs = clampInt(params.get('pollGapLimitSecs'), 15, 600, 60);
                const acTarget = params.get('antiCheatTarget');
                settings.antiCheatTarget = ['group', 'dm', 'both'].includes(acTarget) ? acTarget : 'group';

                settings.answerDelayMins = clampInt(params.get('answerDelayMins'), 5, 480, 90);
                settings.minAttemptsForAnswer = clampInt(params.get('minAttemptsForAnswer'), 1, 50, 2);
                settings.dailyRankEnabled = params.get('dailyRankEnabled') === 'true';
                settings.dailyRankTime = params.get('dailyRankTime') || '07:30';
                settings.dailyRankTarget = params.get('dailyRankTarget') === 'today' ? 'today' : 'yesterday';
                settings.weeklyRankEnabled = params.get('weeklyRankEnabled') === 'true';
                settings.weeklyRankDay = clampInt(params.get('weeklyRankDay'), 0, 6, 0);
                settings.weeklyRankTime = params.get('weeklyRankTime') || '20:00';
                saveConfig();
                addLog(`🛡️ Anti-Cheat (${settings.antiCheatEnabled ? settings.pollGapLimitSecs + 's, ' + settings.antiCheatTarget : 'OFF'}) & Rank settings saved!`);
                redirectTab = 'rank';
                toast = '✅ Anti-Cheat & Leaderboard settings save ho gayi!';
            } else if (pathname === '/send-leaderboard') {
                const period = params.get('period') === 'weekly' ? 'weekly' : 'daily';
                const day = params.get('day') === 'yesterday' ? 'yesterday' : 'today';
                sendLeaderboardToGroup(period, day, true);
                redirectTab = 'rank';
                toast = period === 'weekly'
                    ? '🏆 Weekly Winner Image group mein bheji ja rahi hai...'
                    : '📤 Daily Leaderboard Image group mein bheji ja rahi hai...';
            } else if (pathname === '/send-pending-answers') {
                const pending = leaderboard.batches.filter(b => !b.answerSent);
                if (pending.length === 0) {
                    toast = 'ℹ️ Koi pending Answer Key nahi hai.';
                } else {
                    (async () => {
                        for (const b of pending) {
                            await sendBatchAnswerKey(b);
                            await sleep(1500);
                        }
                    })();
                    toast = `✅ ${pending.length} pending Answer Key(s) abhi bheji ja rahi hain...`;
                }
                redirectTab = 'rank';
            } else if (pathname === '/reset-leaderboard') {
                leaderboard.daily = {};
                leaderboard.weekly = {};
                saveLeaderboard();
                addLog('🗑️ Daily aur Weekly Leaderboard scores reset kar diye gaye.');
                redirectTab = 'rank';
                toast = '🗑️ Leaderboard scores reset ho gaye!';
            } else if (pathname === '/save-progress') {
                settings.progressEnabled = params.get('progressEnabled') === 'true';
                settings.progressUnit = params.get('progressUnit') === 'topic' ? 'topic' : 'chapter';
                settings.progressScope = params.get('progressScope') === 'selected' ? 'selected' : 'all';
                settings.progressAdvanceRule = params.get('progressAdvanceRule') === 'every_slot' ? 'every_slot' : 'daily';
                settings.progressChapterId = params.get('progressChapterId') || '1';
                settings.progressTopicIndex = parseInt(params.get('progressTopicIndex') || '0', 10) || 0;
                settings.progressLastStudyDate = '';
                saveConfig();

                const snap = getProgressSnapshot();
                addLog(`🚀 Auto-Course ${settings.progressEnabled ? 'ON' : 'OFF'} (${settings.progressUnit}) | Start: ${snap.chapter.name}`);
                redirectTab = 'course';
                toast = '✅ Auto-Course settings save ho gayi!';
            } else if (pathname === '/progress-next') {
                moveProgressForward(true);
                redirectTab = 'course';
                toast = '⏭️ Next par shift kar diya!';
            } else if (pathname === '/progress-prev') {
                moveProgressBackward();
                redirectTab = 'course';
                toast = '⏮️ Pichle par aa gaye!';
            } else if (pathname === '/send-current-course') {
                const mode = params.get('mode') || 'qa';
                const fromTab = params.get('fromTab') || 'home';
                const snap = getProgressSnapshot();
                const isPoll = mode === 'poll';

                sendAIContent({
                    chapterIds: [snap.chapter.id],
                    specificTopic: snap.isChapterMode ? '' : snap.topic,
                    type: isPoll ? 'WhatsApp Poll + Auto Answer' : 'Short + Long Q&A (Combo)',
                    count: settings.slot2Count,
                    shortCount: settings.slot1ShortCount,
                    longCount: settings.slot1LongCount,
                    courseMeta: {
                        isChapterMode: snap.isChapterMode,
                        chapterName: snap.chapter.name,
                        topicNum: snap.topicIndex + 1,
                        totalTopics: snap.totalTopics,
                        isNewChapter: snap.isChapterMode || snap.topicIndex === 0
                    }
                });
                redirectTab = fromTab;
                toast = isPoll
                    ? `📊 ${settings.slot2Count} MCQ Polls bheje ja rahe hain...`
                    : `📚 ${settings.slot1ShortCount} Short + ${settings.slot1LongCount} Long Q&A bheje ja rahe hain...`;
            } else if (pathname === '/save-config') {
                const newKey = (params.get('geminiApiKey') || '').trim();
                const newModel = (params.get('geminiModel') || 'auto').trim();
                const newGroup = (params.get('groupName') || '').trim();
                const newNature = (params.get('aiNature') || '').trim();
                settings.slashAskEnabled = params.get('slashAskEnabled') !== 'false';
                settings.slashOnlyTargetGroup = params.get('slashOnlyTargetGroup') !== 'false';
                if (newKey) {
                    settings.geminiApiKey = newKey;
                    detectedWorkingModel = '';
                }
                settings.geminiModel = newModel || 'auto';
                if (newGroup) {
                    settings.groupName = newGroup;
                    targetGroupId = '';
                    refreshGroups();
                }
                if (newNature) settings.aiNature = newNature;
                saveConfig();
                addLog(`✅ Config saved! Group: "${settings.groupName}", /Ask: ${settings.slashAskEnabled ? 'ON' : 'OFF'}`);
                redirectTab = 'setup';
                toast = '✅ Setup settings save ho gayi!';
            } else if (pathname === '/save-schedule') {
                const chapters = params.getAll('chapters').filter(Boolean);
                settings.selectedChapters = chapters.length > 0 ? chapters : SYLLABUS.map(c => c.id);

                const customTopic = (params.get('customTopic') || '').trim();
                const topicSelect = (params.get('topicSelect') || '').trim();
                settings.specificTopic = customTopic || topicSelect;

                settings.slot1Enabled = params.get('slot1Enabled') === 'true';
                settings.slot1Time = params.get('slot1Time') || '06:00';
                settings.slot1Type = params.get('slot1Type') || 'Short + Long Q&A (Combo)';
                settings.slot1Count = clampInt(params.get('slot1Count'), 1, 25, 3);
                settings.slot1ShortCount = clampInt(params.get('slot1ShortCount'), 0, 15, 3);
                settings.slot1LongCount = clampInt(params.get('slot1LongCount'), 0, 10, 1);

                settings.slot2Enabled = params.get('slot2Enabled') === 'true';
                settings.slot2Time = params.get('slot2Time') || '16:00';
                settings.slot2Type = params.get('slot2Type') || 'WhatsApp Poll + Auto Answer';
                settings.slot2Count = clampInt(params.get('slot2Count'), 1, 25, 5);
                settings.slot2ShortCount = clampInt(params.get('slot2ShortCount'), 0, 15, 2);
                settings.slot2LongCount = clampInt(params.get('slot2LongCount'), 0, 10, 1);

                saveConfig();
                addLog(`⏰ Schedule saved! Slot 1: ${settings.slot1Time} | Slot 2: ${settings.slot2Time}`);
                redirectTab = 'schedule';
                toast = '⏰ Schedule & Counts save ho gaye!';
            } else if (pathname === '/send-now') {
                const chapters = params.getAll('chapters').filter(Boolean);
                const customTopic = (params.get('customTopic') || '').trim();
                const topicSelect = (params.get('topicSelect') || '').trim();
                const type = params.get('type') || 'WhatsApp Poll + Auto Answer';
                const count = clampInt(params.get('count'), 1, 25, 5);
                const shortCount = clampInt(params.get('shortCount'), 0, 15, 3);
                const longCount = clampInt(params.get('longCount'), 0, 10, 1);

                sendAIContent({
                    chapterIds: chapters.length > 0 ? chapters : settings.selectedChapters,
                    specificTopic: customTopic || topicSelect,
                    type,
                    count,
                    shortCount,
                    longCount
                });
                redirectTab = 'home';
                toast = '🚀 AI content banakar group mein bheja ja raha hai...';
            } else if (pathname === '/get-pairing') {
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
                redirectTab = 'home';
                toast = '🔑 Naya Pairing Code generate ho raha hai...';
            } else if (pathname === '/get-qr') {
                wantPairingCode = false;
                latestQR = '';
                latestPairingCode = '';
                botStatus = '⏳ Fresh QR Code ban raha hai...';
                addLog('🔄 Fresh QR Code request start kiya...');
                clearSession();
                restartBot(500);
                redirectTab = 'home';
                toast = '📷 Fresh QR Code load ho raha hai...';
            } else if (pathname === '/send-custom') {
                const msg = params.get('message');
                if (msg) {
                    try {
                        await sendToGroup(msg);
                        addLog(`✅ Custom message "${settings.groupName}" mein bheja!`);
                        toast = '✅ Custom message bhej diya gaya!';
                    } catch (err) {
                        addLog(`❌ Custom message error: ${err.message}`);
                        toast = '❌ Error: Logs check karein';
                    }
                }
                redirectTab = 'send';
            }

            const loc = `/?tab=${encodeURIComponent(redirectTab)}${toast ? '&msg=' + encodeURIComponent(toast) : ''}`;
            res.writeHead(302, { Location: loc });
            res.end();
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
}).listen(PORT, () => addLog(`Server running -> Open http://localhost:${PORT}`));

// ==========================================
// WhatsApp Bot Start
// ==========================================
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
            markOnlineOnConnect: false,
            getMessage: async (key) => sentMessageCache.get(key?.id) || undefined
        });

        globalSock = sock;
        sock.ev.on('creds.update', saveCreds);

        // Incoming Poll Votes + /Question Instant AI Replies
        sock.ev.on('messages.upsert', ({ messages, type }) => {
            if (sock !== globalSock || !Array.isArray(messages)) return;
            for (const msg of messages) {
                if (msg.pushName && msg.pushName.trim()) {
                    const pJid = normJid(msg.key?.participantAlt || msg.key?.participant || msg.key?.remoteJid);
                    if (pJid && !pJid.endsWith('@g.us')) {
                        leaderboard.names[pJid] = msg.pushName.trim();
                    }
                }
                if (msg.message?.pollUpdateMessage) {
                    handlePollVoteMessage(msg);
                    continue;
                }
                if (type === 'notify') {
                    handleSlashQuestion(msg);
                }
            }
        });

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
                        if (!isLinked) return;
                        const nowIST = new Date().toLocaleTimeString('en-GB', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        });
                        const todayInfo = getISTParts(0);

                        checkPendingAnswerKeys();

                        if (settings.slot1Enabled && settings.slot1Time === nowIST && lastSlot1Minute !== nowIST) {
                            lastSlot1Minute = nowIST;
                            handleScheduledSlot(
                                'Slot 1',
                                settings.slot1Type,
                                settings.slot1Count,
                                settings.slot1ShortCount,
                                settings.slot1LongCount
                            );
                        }

                        if (settings.slot2Enabled && settings.slot2Time === nowIST && lastSlot2Minute !== nowIST) {
                            lastSlot2Minute = nowIST;
                            handleScheduledSlot(
                                'Slot 2',
                                settings.slot2Type,
                                settings.slot2Count,
                                settings.slot2ShortCount,
                                settings.slot2LongCount
                            );
                        }

                        if (settings.dailyRankEnabled && settings.dailyRankTime === nowIST && lastDailyRankMinute !== nowIST) {
                            lastDailyRankMinute = nowIST;
                            sendLeaderboardToGroup('daily', settings.dailyRankTarget, false);
                        }

                        if (
                            settings.weeklyRankEnabled &&
                            Number(settings.weeklyRankDay) === todayInfo.dayOfWeek &&
                            settings.weeklyRankTime === nowIST &&
                            lastWeeklyRankMinute !== nowIST
                        ) {
                            lastWeeklyRankMinute = nowIST;
                            sendLeaderboardToGroup('weekly', 'today', false);
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
