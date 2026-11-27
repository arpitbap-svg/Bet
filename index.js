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
    { val: 'Important Board Topic (Notes)', label: '📖 Important Board Topic (Notes)' },
    { val: 'Question & Answer (Short 2-4 Marks)', label: '❓ Question & Answer (Short 2-4 Marks)' },
    { val: 'WhatsApp Poll (MCQ)', label: '📊 WhatsApp Poll (MCQ)' },
    { val: 'WhatsApp Poll + Auto Answer', label: '📊 WhatsApp Poll + 5 Min Baad Answer' },
    { val: 'Long Question & Answer (5-6 Marks)', label: '📄 Long Question & Answer (5-6 Marks)' },
    { val: 'Text MCQ Quiz (With Answer)', label: '✅ Text MCQ Quiz (With Answer)' },
    { val: 'C Program / Coding Q&A', label: '💻 C Program / Coding Q&A' }
];

const DEFAULT_SETTINGS = {
    geminiApiKey: '',
    geminiModel: 'auto',
    phoneNumber: '919369249280',
    groupName: 'Arpit',
    aiNature: 'Tum ek experienced Class 10 UP Board Computer Science teacher ho. Hamesha simple, clear Hindi/Hinglish mein samjhao. Sirf wahi important Computer questions, MCQs aur topics bhejo jo board paper mein baar-baar puche jate hain. WhatsApp formatting (*bold*, bullet points) use karo aur faltu lambi baatein mat likho.',
    selectedChapters: ['2', '3', '5', '9', '10', '12'],
    specificTopic: '',
    progressEnabled: true,
    progressScope: 'all',
    progressAdvanceRule: 'daily',
    progressChapterId: '1',
    progressTopicIndex: 0,
    progressLastStudyDate: '',
    slot1Enabled: true,
    slot1Time: '08:00',
    slot1Type: 'Important Board Topic (Notes)',
    slot1Count: 1,
    slot2Enabled: true,
    slot2Time: '18:00',
    slot2Type: 'WhatsApp Poll + Auto Answer',
    slot2Count: 3
};

let settings = { ...DEFAULT_SETTINGS };

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

function getActiveApiKey() {
    const raw = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
    return raw.trim().replace(/^["']|["']$/g, '');
}

function getTodayIST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
let lastSlot1Minute = '';
let lastSlot2Minute = '';
let availableGroups = [];
let detectedWorkingModel = '';
const activityLogs = [];

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

// ==========================================
// Auto-Course Progression Helpers
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
    let tIdx = parseInt(customTopicIndex !== undefined ? customTopicIndex : settings.progressTopicIndex, 10);
    if (isNaN(tIdx) || tIdx < 0 || tIdx >= chapter.topics.length) tIdx = 0;

    // Overall progress stats
    let totalCourseTopics = 0;
    let currentOverallNum = 0;
    for (let i = 0; i < list.length; i++) {
        if (i < chIdx) currentOverallNum += list[i].topics.length;
        else if (i === chIdx) currentOverallNum += (tIdx + 1);
        totalCourseTopics += list[i].topics.length;
    }

    let nextChIdx = chIdx;
    let nextTIdx = tIdx + 1;
    let willSwitchChapter = false;
    let willWrapCourse = false;

    if (nextTIdx >= chapter.topics.length) {
        willSwitchChapter = true;
        nextChIdx = chIdx + 1;
        if (nextChIdx >= list.length) {
            nextChIdx = 0;
            willWrapCourse = true;
        }
        nextTIdx = 0;
    }

    const nextChapter = list[nextChIdx];
    const nextTopic = nextChapter.topics[nextTIdx];

    return {
        list,
        chIdx,
        chapter,
        topicIndex: tIdx,
        topic: chapter.topics[tIdx],
        totalTopics: chapter.topics.length,
        chapterPercent: Math.round(((tIdx + 1) / chapter.topics.length) * 100),
        currentOverallNum,
        totalCourseTopics,
        coursePercent: Math.round((currentOverallNum / Math.max(totalCourseTopics, 1)) * 100),
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

    if (snap.willWrapCourse) {
        addLog(`🎉 Poora syllabus complete! Revision ke liye wapas ${snap.nextChapter.name} -> ${snap.nextTopic} par switch kiya.`);
    } else if (snap.willSwitchChapter) {
        addLog(`📚 Chapter complete! Naye chapter par switch: ${snap.nextChapter.name} -> ${snap.nextTopic}`);
    } else {
        addLog(`⏭️ Next Topic set: ${snap.nextChapter.name} -> ${snap.nextTopic}`);
    }
    return snap;
}

function moveProgressBackward() {
    const snap = getProgressSnapshot();
    let prevChIdx = snap.chIdx;
    let prevTIdx = snap.topicIndex - 1;

    if (prevTIdx < 0) {
        prevChIdx = snap.chIdx - 1;
        if (prevChIdx < 0) prevChIdx = snap.list.length - 1;
        prevTIdx = snap.list[prevChIdx].topics.length - 1;
    }

    const prevCh = snap.list[prevChIdx];
    settings.progressChapterId = prevCh.id;
    settings.progressTopicIndex = prevTIdx;
    settings.progressLastStudyDate = '';
    saveConfig();
    addLog(`⏮️ Pichle topic par gaye: ${prevCh.name} -> ${prevCh.topics[prevTIdx]}`);
}

// ==========================================
// WhatsApp Session & Group Helpers
// ==========================================
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

async function getTargetGroup() {
    if (!globalSock || !isLinked) throw new Error('Bot abhi WhatsApp se connect nahi hai!');
    const groups = await globalSock.groupFetchAllParticipating();
    availableGroups = Object.values(groups).map(g => g.subject).filter(Boolean);

    const targetGroup = Object.values(groups).find(
        (g) => g.subject && g.subject.trim().toLowerCase() === settings.groupName.trim().toLowerCase()
    );
    if (!targetGroup) {
        throw new Error(`Group "${settings.groupName}" nahi mila! Available groups: ${availableGroups.join(', ') || 'None'}`);
    }
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

        if (valid.length > 0) {
            return { apiVer, models: valid };
        }
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
        courseNote = `\nDaily Auto-Course Position: ${courseMeta.chapterName} -> Topic ${courseMeta.topicNum}/${courseMeta.totalTopics}: "${cleanTopic}".`;
    }

    const scopeInstruction = cleanTopic
        ? `STRICT TOPIC RULE: Sirf aur sirf is exact topic par focus karo -> "${cleanTopic}". Bahar ke topic se kuch mat likhna.${courseNote}\nReference Syllabus:\n${chapterSummary}`
        : `STRICT CHAPTER RULE: Sirf neeche diye gaye selected chapters aur unke topics ke andar se hi questions/content banao (bahar ke chapter se kuch mat lena):\n${chapterSummary}`;

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
            return {
                question,
                options: uniqueOpts.slice(0, 4),
                answer: String(item.answer || '').trim(),
                explanation: String(item.explanation || '').trim()
            };
        })
        .filter(p => p.question && p.options.length >= 2);
}

async function sendAIContent({ chapterIds, specificTopic, type, count = 1, courseMeta = null }) {
    try {
        const apiKey = getActiveApiKey();
        if (!apiKey) {
            throw new Error('Gemini API Key set nahi hai! Render Environment ya Web Setup mein key dalein.');
        }

        const safeCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 5);
        const { label, scopeInstruction } = buildSyllabusScope(chapterIds, specificTopic, courseMeta);
        addLog(`⏳ AI se ${safeCount} "${type}" bana raha hu [${label}]...`);

        if (type === 'WhatsApp Poll (MCQ)' || type === 'WhatsApp Poll + Auto Answer') {
            const pollPrompt = `${scopeInstruction}

Class 10 UP Board Computer Science exam ke liye exact ${safeCount} sabse important MCQ questions banao.
Language: Simple Hindi/Hinglish (easy to understand).
Har question chhota aur clear rakho (WhatsApp Poll ke liye max 180 characters) aur exactly 4 alag-alag options do (har option max 60 characters).

SIRF VALID JSON ARRAY RETURN KARO, aur koi extra text mat likho. Exact JSON format:
[
  {
    "question": "Q1. [Sawal yahan]",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "answer": "Sahi option ka exact text",
    "explanation": "1 line mein simple reason"
  }
]`;

            const raw = await generateWithAutoGemini(apiKey, pollPrompt, settings.aiNature);
            const polls = parsePollJSON(raw);
            if (polls.length === 0) throw new Error('AI se valid Poll data nahi bana, dobara try karein.');

            const targetGroup = await getTargetGroup();

            if (courseMeta) {
                let intro = courseMeta.isNewChapter ? `🎉 *Naya Chapter Shuru!* 🎉\n` : '';
                intro += `📚 *${courseMeta.chapterName}*\n🎯 *Aaj ka Topic (${courseMeta.topicNum}/${courseMeta.totalTopics}):* ${specificTopic}\n👇 *Neeche diye gaye Poll mein vote karein:*`;
                await globalSock.sendMessage(targetGroup.id, { text: intro });
                await sleep(1000);
            }

            for (let i = 0; i < polls.length; i++) {
                const p = polls[i];
                await globalSock.sendMessage(targetGroup.id, {
                    poll: {
                        name: p.question,
                        values: p.options,
                        selectableCount: 1
                    }
                });
                if (i < polls.length - 1) await sleep(1500);
            }

            addLog(`📊 ${polls.length} WhatsApp Poll(s) "${settings.groupName}" group mein bhej diye gaye!`);

            if (type === 'WhatsApp Poll + Auto Answer') {
                addLog('⏱️ 5 minute baad Poll ke sahi answers group mein bheje jayenge.');
                setTimeout(async () => {
                    try {
                        let ansMsg = `✅ *Poll Quiz Answer Key*${specificTopic ? ' (' + specificTopic + ')' : ''}\n\n`;
                        polls.forEach((p, idx) => {
                            ansMsg += `*${idx + 1}.* ${p.question}\n👉 *Sahi Answer:* ${p.answer}`;
                            if (p.explanation) ansMsg += `\n💡 ${p.explanation}`;
                            ansMsg += `\n\n`;
                        });
                        await sendToGroup(ansMsg.trim());
                        addLog(`✅ Poll Answer Key "${settings.groupName}" group mein bhej di gayi!`);
                    } catch (e) {
                        addLog(`❌ Answer key bhejne mein error: ${e.message}`);
                    }
                }, 5 * 60 * 1000);
            }
            return true;
        }

        let prompt = '';
        if (type === 'Important Board Topic (Notes)') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke is topic par simple, complete aur board-exam oriented study notes banao Hindi/Hinglish mein (students ise padh kar aasani se topic samajh sakein).
Format:
📖 *Class 10 Computer - Daily Topic Notes*
*Chapter:* [Chapter ka naam]
*Topic:* [Topic ka naam]
*Kya Hai (Asaan Samajh):* [Clear bullet points]
*Example / Code (agar relevant ho):* [Chhota saaf example]
*Board Exam Important Point:* [1-2 lines]`;
        } else if (type === 'Question & Answer (Short 2-4 Marks)') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke ${safeCount} bahut important Short Answer Questions (2 se 4 marks wale) aur unke clear, point-wise answers likho simple Hindi/Hinglish mein.
Format:
❓ *Class 10 Computer - Important Q&A*
*Q1.* [Board exam question]
*Ans:* [Clear board-style answer]`;
        } else if (type === 'Long Question & Answer (5-6 Marks)') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke ${safeCount} important Long Question (5-6 marks) aur uska heading/bullet-point wise complete answer likho simple Hindi/Hinglish mein.`;
        } else if (type === 'Text MCQ Quiz (With Answer)') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke ${safeCount} most important MCQ questions unke 4 options, sahi answer aur 1-line explanation ke saath likho.`;
        } else if (type === 'C Program / Coding Q&A') {
            prompt = `${scopeInstruction}

Class 10 UP Board Computer Science ke ${safeCount} important C Programming / Practical question do, uska chhota aur bilkul sahi C code aur output samjhao.`;
        } else {
            prompt = `${scopeInstruction}\n\nClass 10 UP Board Computer Science ke ${safeCount} important questions aur answers do.`;
        }

        let aiText = await generateWithAutoGemini(apiKey, prompt, settings.aiNature);

        if (courseMeta) {
            let header = courseMeta.isNewChapter ? `🎉 *Naya Chapter Shuru: ${courseMeta.chapterName}* 🎉\n` : `📚 *${courseMeta.chapterName}*\n`;
            header += `🎯 *Topic ${courseMeta.topicNum}/${courseMeta.totalTopics}:* ${specificTopic}\n\n`;
            aiText = header + aiText;
        }

        await sendToGroup(aiText);
        addLog(`✅ ${safeCount} "${type}" "${settings.groupName}" group mein bhej diya gaya!`);
        return true;
    } catch (err) {
        addLog(`❌ AI/Send Error: ${err.message || err}`);
        return false;
    }
}

async function handleScheduledSlot(slotLabel, type, count) {
    if (!settings.progressEnabled) {
        addLog(`⏰ ${slotLabel} triggered (Normal Mode) -> ${type}`);
        await sendAIContent({
            chapterIds: settings.selectedChapters,
            specificTopic: settings.specificTopic,
            type,
            count
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
        } else if (!settings.progressLastStudyDate && targetTopicIndex === 0) {
            isNewChapter = true;
        }
    } else if (!settings.progressLastStudyDate && targetTopicIndex === 0) {
        isNewChapter = true;
    }

    const snap = getProgressSnapshot(targetChapterId, targetTopicIndex);
    addLog(`🚀 ${slotLabel} (Auto-Course) -> ${snap.chapter.name} | Topic ${snap.topicIndex + 1}/${snap.totalTopics}: ${snap.topic}`);

    const ok = await sendAIContent({
        chapterIds: [snap.chapter.id],
        specificTopic: snap.topic,
        type,
        count,
        courseMeta: {
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
        if (snap.willSwitchChapter) {
            addLog(`📚 Chapter complete! Agle slot ke liye naya chapter set: ${snap.nextChapter.name} -> ${snap.nextTopic}`);
        } else {
            addLog(`⏭️ Agle slot ke liye next topic set: ${snap.nextChapter.name} -> ${snap.nextTopic}`);
        }
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

function renderCountOptions(selectedCount) {
    return [1, 2, 3, 4, 5].map(
        n => `<option value="${n}" ${Number(selectedCount) === n ? 'selected' : ''}>${n}</option>`
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

function getDashboardHTML(activeTab = 'home', toastMsg = '') {
    const validTabs = ['home', 'course', 'send', 'schedule', 'setup'];
    const currentTab = validTabs.includes(activeTab) ? activeTab : 'home';
    const hasKey = Boolean(getActiveApiKey());
    const keySource = settings.geminiApiKey ? 'Web' : (process.env.GEMINI_API_KEY ? 'Render' : 'Missing');
    const prog = getProgressSnapshot();

    const startChapterOptions = SYLLABUS.map(
        ch => `<option value="${ch.id}" ${prog.chapter.id === ch.id ? 'selected' : ''}>${escapeHtml(ch.name)}${ch.important ? ' ⭐' : ''}</option>`
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
            --blue: #2563eb;
            --orange: #ea580c;
            --purple: #7c3aed;
            --danger: #dc2626;
            --radius: 16px;
        }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 0 0 88px 0;
        }
        .app-shell {
            max-width: 540px;
            margin: 0 auto;
            padding: 14px 14px 20px 14px;
        }

        /* Hero Header */
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
        .hero-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .hero h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 800;
            letter-spacing: -0.3px;
        }
        .hero-sub {
            font-size: 12px;
            color: #a7f3d0;
            margin-top: 3px;
            font-weight: 500;
        }
        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(255,255,255,0.16);
            backdrop-filter: blur(8px);
            padding: 6px 11px;
            border-radius: 999px;
            font-size: 11.5px;
            font-weight: 700;
            white-space: nowrap;
        }
        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #fbbf24;
            box-shadow: 0 0 0 3px rgba(251,191,36,0.3);
        }
        .dot.live {
            background: #34d399;
            box-shadow: 0 0 0 3px rgba(52,211,153,0.35);
            animation: pulse 1.8s infinite;
        }
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.65); }
            70% { box-shadow: 0 0 0 7px rgba(52,211,153,0); }
            100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
        }
        .hero-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 14px;
        }
        .stat-mini {
            background: rgba(255,255,255,0.12);
            border-radius: 12px;
            padding: 8px 10px;
        }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #a7f3d0; font-weight: 600; }
        .stat-val { font-size: 13px; font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Cards & Sections */
        .tab-panel { display: none; animation: fadeIn 0.2s ease; }
        .tab-panel.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        .card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 16px;
            margin-bottom: 14px;
            box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
        }
        .card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        .card-title {
            margin: 0;
            font-size: 15.5px;
            font-weight: 800;
            color: var(--text);
            display: flex;
            align-items: center;
            gap: 7px;
        }
        .pill-badge {
            font-size: 11px;
            font-weight: 700;
            padding: 4px 9px;
            border-radius: 999px;
            background: #ecfdf5;
            color: #047857;
        }
        .pill-badge.off { background: #fef2f2; color: #b91c1c; }

        /* Progress Bar */
        .course-banner {
            background: linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%);
            border: 1px solid #bbf7d0;
            border-radius: 14px;
            padding: 14px;
            margin-bottom: 12px;
        }
        .course-ch { font-size: 12px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.3px; }
        .course-topic { font-size: 16px; font-weight: 800; color: #0f172a; margin: 4px 0 10px 0; line-height: 1.35; }
        .pbar-wrap { margin-bottom: 8px; }
        .pbar-meta { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 4px; }
        .pbar-track { height: 8px; background: rgba(15,23,42,0.09); border-radius: 999px; overflow: hidden; }
        .pbar-fill { height: 100%; background: linear-gradient(90deg, #10b981, #059669); border-radius: 999px; transition: width 0.3s ease; }
        .pbar-fill.blue { background: linear-gradient(90deg, #3b82f6, #2563eb); }
        .next-hint { font-size: 12px; color: #334155; background: rgba(255,255,255,0.75); padding: 8px 10px; border-radius: 10px; margin-top: 8px; border: 1px dashed #94a3b8; }

        /* Forms & Controls */
        label.field-lbl {
            display: block;
            font-size: 12.5px;
            font-weight: 700;
            color: #334155;
            margin: 11px 0 5px 0;
        }
        input[type="text"], input[type="password"], input[type="time"], select, textarea {
            width: 100%;
            padding: 11px 12px;
            border: 1.5px solid var(--border);
            border-radius: 11px;
            font-family: inherit;
            font-size: 14px;
            color: var(--text);
            background: #f8fafc;
            transition: border-color 0.15s, background 0.15s;
        }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--primary);
            background: #ffffff;
        }
        textarea { resize: vertical; line-height: 1.45; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }

        /* Buttons */
        .btn {
            width: 100%;
            min-height: 44px;
            padding: 10px 14px;
            border: none;
            border-radius: 12px;
            font-family: inherit;
            font-size: 14px;
            font-weight: 700;
            color: #fff;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin-top: 10px;
            transition: transform 0.1s, opacity 0.15s;
        }
        .btn:active { transform: scale(0.98); }
        .btn-green { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 4px 12px rgba(5,150,105,0.25); }
        .btn-blue { background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 4px 12px rgba(37,99,235,0.22); }
        .btn-orange { background: linear-gradient(135deg, #f97316, #ea580c); box-shadow: 0 4px 12px rgba(234,88,12,0.22); }
        .btn-purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); box-shadow: 0 4px 12px rgba(124,58,237,0.22); }
        .btn-soft {
            background: #e2e8f0;
            color: #1e293b;
            min-height: 36px;
            font-size: 12.5px;
            padding: 7px 10px;
            margin-top: 6px;
        }
        .btn-outline {
            background: #fff;
            color: #0f172a;
            border: 1.5px solid var(--border);
            min-height: 40px;
            font-size: 13px;
        }

        /* Chapter Picker */
        .ch-list {
            max-height: 230px;
            overflow-y: auto;
            border: 1.5px solid var(--border);
            border-radius: 12px;
            padding: 6px;
            background: #f8fafc;
            margin-top: 6px;
        }
        .ch-card {
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 8px 10px;
            border-radius: 9px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            color: #1e293b;
            transition: background 0.12s;
        }
        .ch-card:hover { background: #e2e8f0; }
        .ch-card input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: var(--primary);
            margin: 0;
            flex-shrink: 0;
        }
        .ch-text { flex: 1; }
        .badge-imp {
            background: #fef3c7;
            color: #b45309;
            border: 1px solid #fde68a;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 6px;
        }

        /* Slot Cards */
        .slot-card {
            background: #f8fafc;
            border: 1.5px solid var(--border);
            border-radius: 14px;
            padding: 13px;
            margin-bottom: 12px;
        }
        .slot-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 800;
            font-size: 14px;
            color: #0f172a;
            margin-bottom: 6px;
        }

        /* Auth Box */
        .auth-box {
            text-align: center;
            background: #fffbeb;
            border: 1.5px dashed #f59e0b;
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 14px;
        }
        .pairing-code {
            font-size: 28px;
            font-weight: 800;
            letter-spacing: 4px;
            color: #b91c1c;
            background: #fee2e2;
            padding: 14px;
            border-radius: 12px;
            margin: 10px 0;
            border: 1px solid #fecaca;
        }
        .qr-frame {
            display: inline-block;
            background: #fff;
            padding: 10px;
            border-radius: 14px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.08);
            margin: 8px 0;
        }

        /* Clickable Group Chips */
        .chips-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
        .chip {
            background: #e0f2fe;
            color: #0369a1;
            border: 1px solid #bae6fd;
            padding: 5px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
        }
        .chip:active { background: #0284c7; color: #fff; }
        .hint-txt { font-size: 11.5px; color: var(--muted); margin-top: 5px; }

        /* Live Terminal Logs */
        .terminal {
            background: #0f172a;
            color: #34d399;
            border-radius: 12px;
            padding: 12px;
            max-height: 250px;
            overflow-y: auto;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11.5px;
            line-height: 1.55;
        }
        .log-row {
            padding: 4px 0;
            border-bottom: 1px solid rgba(255,255,255,0.07);
            word-break: break-word;
        }
        .log-row.err { color: #f87171; }
        .log-row.warn { color: #fbbf24; }

        /* Quick Summary Grid on Home */
        .schedule-mini {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .s-tile {
            background: #f8fafc;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 11px;
        }
        .s-tile-time { font-size: 18px; font-weight: 800; color: var(--text); margin: 3px 0; }
        .s-tile-type { font-size: 11.5px; color: var(--muted); font-weight: 600; }

        /* Bottom Navigation Bar */
        .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(255, 255, 255, 0.94);
            backdrop-filter: blur(12px);
            border-top: 1px solid var(--border);
            z-index: 100;
            padding: 6px 8px calc(8px + env(safe-area-inset-bottom));
        }
        .nav-inner {
            max-width: 540px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 4px;
        }
        .nav-btn {
            background: transparent;
            border: none;
            border-radius: 12px;
            padding: 6px 4px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            color: var(--muted);
            font-family: inherit;
            font-size: 10.5px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s;
        }
        .nav-btn .ico { font-size: 19px; line-height: 1; }
        .nav-btn.active {
            background: #ecfdf5;
            color: var(--primary-dark);
        }

        /* Toast Popup */
        .toast {
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: #0f172a;
            color: #fff;
            padding: 11px 18px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 10px 25px rgba(0,0,0,0.25);
            z-index: 999;
            max-width: 90%;
            text-align: center;
            animation: slideDown 0.25s ease;
        }
        @keyframes slideDown { from { opacity: 0; top: 0; } to { opacity: 1; top: 16px; } }
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
                    <div class="hero-sub">UP Board AI Study & Poll Manager</div>
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
                    <div class="stat-label">Auto-Course</div>
                    <div class="stat-val">${settings.progressEnabled ? prog.coursePercent + '% Done' : 'OFF'}</div>
                </div>
                <div class="stat-mini">
                    <div class="stat-label">Gemini API</div>
                    <div class="stat-val">${hasKey ? '🟢 ' + keySource : '🔴 Not Set'}</div>
                </div>
            </div>
        </div>

        <!-- WhatsApp Auth Card (Visible when not connected) -->
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
                    <h3 class="card-title">🚀 Aaj ka Study Topic</h3>
                    <span class="pill-badge ${settings.progressEnabled ? '' : 'off'}">${settings.progressEnabled ? 'Auto-Course ON' : 'Manual Mode'}</span>
                </div>
                <div class="course-banner">
                    <div class="course-ch">${escapeHtml(prog.chapter.name)}</div>
                    <div class="course-topic">${escapeHtml(prog.topic)}</div>
                    <div class="pbar-wrap">
                        <div class="pbar-meta">
                            <span>Chapter Progress (Topic ${prog.topicIndex + 1}/${prog.totalTopics})</span>
                            <span>${prog.chapterPercent}%</span>
                        </div>
                        <div class="pbar-track"><div class="pbar-fill" style="width:${prog.chapterPercent}%"></div></div>
                    </div>
                    <div class="pbar-wrap" style="margin-bottom:0;">
                        <div class="pbar-meta">
                            <span>Full Syllabus (${prog.currentOverallNum}/${prog.totalCourseTopics} Topics)</span>
                            <span>${prog.coursePercent}%</span>
                        </div>
                        <div class="pbar-track"><div class="pbar-fill blue" style="width:${prog.coursePercent}%"></div></div>
                    </div>
                </div>
                <div class="grid-2">
                    <form method="POST" action="/send-current-course">
                        <input type="hidden" name="mode" value="notes">
                        <input type="hidden" name="fromTab" value="home">
                        <button type="submit" class="btn btn-blue" style="margin-top:0;">📖 Notes Bhejein</button>
                    </form>
                    <form method="POST" action="/send-current-course">
                        <input type="hidden" name="mode" value="poll">
                        <input type="hidden" name="fromTab" value="home">
                        <button type="submit" class="btn btn-green" style="margin-top:0;">📊 Poll Bhejein</button>
                    </form>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⏰ Aaj ke Auto Time Slots</h3>
                    <button type="button" class="btn-soft" style="width:auto; margin:0;" onclick="switchTab('schedule')">Edit</button>
                </div>
                <div class="schedule-mini">
                    <div class="s-tile">
                        <div style="font-size:11px; font-weight:700; color:${settings.slot1Enabled ? '#059669' : '#dc2626'};">
                            ${settings.slot1Enabled ? '🟢 SLOT 1 ON' : '🔴 SLOT 1 OFF'}
                        </div>
                        <div class="s-tile-time">${escapeHtml(settings.slot1Time)}</div>
                        <div class="s-tile-type">${escapeHtml(settings.slot1Type)} (${settings.slot1Count})</div>
                    </div>
                    <div class="s-tile">
                        <div style="font-size:11px; font-weight:700; color:${settings.slot2Enabled ? '#059669' : '#dc2626'};">
                            ${settings.slot2Enabled ? '🟢 SLOT 2 ON' : '🔴 SLOT 2 OFF'}
                        </div>
                        <div class="s-tile-time">${escapeHtml(settings.slot2Time)}</div>
                        <div class="s-tile-type">${escapeHtml(settings.slot2Type)} (${settings.slot2Count})</div>
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

        <!-- TAB 2: AUTO-COURSE -->
        <div id="tab-course" class="tab-panel ${currentTab === 'course' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">🚀 Daily Auto-Course Mode</h3>
                    <span class="pill-badge ${settings.progressEnabled ? '' : 'off'}">${settings.progressEnabled ? '🟢 ON' : '🔴 OFF'}</span>
                </div>
                <div class="course-banner">
                    <div class="course-ch">${escapeHtml(prog.chapter.name)}</div>
                    <div class="course-topic">${prog.topicIndex + 1}. ${escapeHtml(prog.topic)}</div>
                    <div class="pbar-wrap">
                        <div class="pbar-meta">
                            <span>Chapter (${prog.topicIndex + 1}/${prog.totalTopics})</span>
                            <span>${prog.chapterPercent}%</span>
                        </div>
                        <div class="pbar-track"><div class="pbar-fill" style="width:${prog.chapterPercent}%"></div></div>
                    </div>
                    <div class="next-hint">
                        ⏭️ <b>Agla Topic:</b> ${escapeHtml(prog.nextTopic)}
                        ${prog.willSwitchChapter ? `<br>📚 <i>Chapter khatam! Auto-switch hoga → <b>${escapeHtml(prog.nextChapter.name)}</b></i>` : ''}
                    </div>
                </div>

                <div class="grid-2">
                    <form method="POST" action="/progress-prev">
                        <button type="submit" class="btn btn-outline" style="margin-top:0;">⏮️ Pichla Topic</button>
                    </form>
                    <form method="POST" action="/progress-next">
                        <button type="submit" class="btn btn-outline" style="margin-top:0;">⏭️ Agla Topic</button>
                    </form>
                </div>

                <form method="POST" action="/save-progress" style="margin-top:8px;">
                    <label class="field-lbl">Auto-Course Progression</label>
                    <select name="progressEnabled">
                        <option value="true" ${settings.progressEnabled ? 'selected' : ''}>🟢 ON — Roz naya topic & auto next chapter</option>
                        <option value="false" ${!settings.progressEnabled ? 'selected' : ''}>🔴 OFF — Normal Mix Schedule chalayein</option>
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
                            <label class="field-lbl">Advance Rule</label>
                            <select name="progressAdvanceRule">
                                <option value="daily" ${settings.progressAdvanceRule === 'daily' ? 'selected' : ''}>📅 Roz 1 Naya Topic</option>
                                <option value="every_slot" ${settings.progressAdvanceRule === 'every_slot' ? 'selected' : ''}>⚡ Har Slot Par Next</option>
                            </select>
                        </div>
                    </div>

                    <label class="field-lbl">Starting Chapter Chunein</label>
                    <select id="prog-ch-select" name="progressChapterId" onchange="updateProgressTopics()">
                        ${startChapterOptions}
                    </select>

                    <label class="field-lbl">Starting Topic Chunein</label>
                    <select id="prog-topic-select" name="progressTopicIndex"></select>

                    <button type="submit" class="btn btn-green">💾 Auto-Course Point Save Karein</button>
                </form>
            </div>
        </div>

        <!-- TAB 3: SEND NOW & CUSTOM -->
        <div id="tab-send" class="tab-panel ${currentTab === 'send' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⚡ Abhi Turant AI Poll / Q&A Bhejein</h3>
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

                    <div class="grid-2">
                        <div>
                            <label class="field-lbl">Format / Type</label>
                            <select name="type">${renderTypeOptions('WhatsApp Poll (MCQ)')}</select>
                        </div>
                        <div>
                            <label class="field-lbl">Kitne (Count)</label>
                            <select name="count">${renderCountOptions(2)}</select>
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

        <!-- TAB 4: SCHEDULE -->
        <div id="tab-schedule" class="tab-panel ${currentTab === 'schedule' ? 'active' : ''}">
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">⏰ Daily Auto Schedule (IST)</h3>
                </div>
                <form method="POST" action="/save-schedule">
                    <div class="slot-card">
                        <div class="slot-head">
                            <span>🌅 Time Slot 1</span>
                            <span style="font-size:11px; color:var(--muted);">e.g. Subah Notes / Q&A</span>
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
                                <label class="field-lbl">Time (IST)</label>
                                <input type="time" name="slot1Time" value="${escapeHtml(settings.slot1Time)}" required>
                            </div>
                        </div>
                        <div class="grid-2">
                            <div>
                                <label class="field-lbl">Kya Bheje</label>
                                <select name="slot1Type">${renderTypeOptions(settings.slot1Type)}</select>
                            </div>
                            <div>
                                <label class="field-lbl">Kitne</label>
                                <select name="slot1Count">${renderCountOptions(settings.slot1Count)}</select>
                            </div>
                        </div>
                    </div>

                    <div class="slot-card">
                        <div class="slot-head">
                            <span>🌇 Time Slot 2</span>
                            <span style="font-size:11px; color:var(--muted);">e.g. Shaam ko MCQ Poll</span>
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
                                <label class="field-lbl">Time (IST)</label>
                                <input type="time" name="slot2Time" value="${escapeHtml(settings.slot2Time)}" required>
                            </div>
                        </div>
                        <div class="grid-2">
                            <div>
                                <label class="field-lbl">Kya Bheje</label>
                                <select name="slot2Type">${renderTypeOptions(settings.slot2Type)}</select>
                            </div>
                            <div>
                                <label class="field-lbl">Kitne</label>
                                <select name="slot2Count">${renderCountOptions(settings.slot2Count)}</select>
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

                    <button type="submit" class="btn btn-blue">💾 Schedule & Chapters Save Karein</button>
                </form>
            </div>
        </div>

        <!-- TAB 5: SETUP -->
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
    </div>

    <!-- Bottom Navigation -->
    <nav class="bottom-nav">
        <div class="nav-inner">
            <button type="button" class="nav-btn ${currentTab === 'home' ? 'active' : ''}" data-tab="home" onclick="switchTab('home')">
                <span class="ico">🏠</span><span>Home</span>
            </button>
            <button type="button" class="nav-btn ${currentTab === 'course' ? 'active' : ''}" data-tab="course" onclick="switchTab('course')">
                <span class="ico">🚀</span><span>Course</span>
            </button>
            <button type="button" class="nav-btn ${currentTab === 'send' ? 'active' : ''}" data-tab="send" onclick="switchTab('send')">
                <span class="ico">⚡</span><span>Send</span>
            </button>
            <button type="button" class="nav-btn ${currentTab === 'schedule' ? 'active' : ''}" data-tab="schedule" onclick="switchTab('schedule')">
                <span class="ico">⏰</span><span>Schedule</span>
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

        // Hide toast after 3.2s
        var toastEl = document.getElementById('toast');
        if (toastEl) {
            setTimeout(function() { toastEl.style.display = 'none'; }, 3200);
        }

        function switchTab(tabName) {
            document.querySelectorAll('.tab-panel').forEach(function(p) {
                p.classList.remove('active');
            });
            document.querySelectorAll('.nav-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            var panel = document.getElementById('tab-' + tabName);
            var btn = document.querySelector('.nav-btn[data-tab="' + tabName + '"]');
            if (panel) panel.classList.add('active');
            if (btn) btn.classList.add('active');
            if (history.replaceState) {
                history.replaceState(null, '', '/?tab=' + encodeURIComponent(tabName));
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function pickGroup(name) {
            var inp = document.getElementById('group-name-input');
            if (inp) {
                inp.value = name;
                inp.focus();
            }
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
                if (chId === CURRENT_PROG_CH && idx === CURRENT_PROG_TIDX) {
                    opt.selected = true;
                }
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

                    // Clickable group chips
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
                            var cls = l.indexOf('❌') !== -1 ? 'err' : (l.indexOf('⚠️') !== -1 ? 'warn' : '');
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

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const params = new URLSearchParams(body);
            let redirectTab = 'home';
            let toast = '';

            if (pathname === '/save-progress') {
                settings.progressEnabled = params.get('progressEnabled') === 'true';
                settings.progressScope = params.get('progressScope') === 'selected' ? 'selected' : 'all';
                settings.progressAdvanceRule = params.get('progressAdvanceRule') === 'every_slot' ? 'every_slot' : 'daily';
                settings.progressChapterId = params.get('progressChapterId') || '1';
                settings.progressTopicIndex = parseInt(params.get('progressTopicIndex') || '0', 10) || 0;
                settings.progressLastStudyDate = '';
                saveConfig();

                const snap = getProgressSnapshot();
                addLog(`🚀 Auto-Course ${settings.progressEnabled ? 'ON' : 'OFF'} | Start: ${snap.chapter.name} -> ${snap.topic}`);
                redirectTab = 'course';
                toast = '✅ Auto-Course point save ho gaya!';
            } else if (pathname === '/progress-next') {
                moveProgressForward(true);
                redirectTab = 'course';
                toast = '⏭️ Agle topic par shift kar diya!';
            } else if (pathname === '/progress-prev') {
                moveProgressBackward();
                redirectTab = 'course';
                toast = '⏮️ Pichle topic par aa gaye!';
            } else if (pathname === '/send-current-course') {
                const mode = params.get('mode') || 'notes';
                const fromTab = params.get('fromTab') || 'home';
                const snap = getProgressSnapshot();
                const type = mode === 'poll' ? 'WhatsApp Poll + Auto Answer' : 'Important Board Topic (Notes)';
                const count = mode === 'poll' ? 3 : 1;

                sendAIContent({
                    chapterIds: [snap.chapter.id],
                    specificTopic: snap.topic,
                    type,
                    count,
                    courseMeta: {
                        chapterName: snap.chapter.name,
                        topicNum: snap.topicIndex + 1,
                        totalTopics: snap.totalTopics,
                        isNewChapter: snap.topicIndex === 0
                    }
                });
                redirectTab = fromTab;
                toast = mode === 'poll' ? '📊 Aaj ka Poll bheja ja raha hai...' : '📖 Aaj ke Notes bheje ja rahe hain...';
            } else if (pathname === '/save-config') {
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
                redirectTab = 'setup';
                toast = '✅ Setup settings save ho gayi!';
            } else if (pathname === '/save-schedule') {
                const chapters = params.getAll('chapters').filter(Boolean);
                settings.selectedChapters = chapters.length > 0 ? chapters : SYLLABUS.map(c => c.id);

                const customTopic = (params.get('customTopic') || '').trim();
                const topicSelect = (params.get('topicSelect') || '').trim();
                settings.specificTopic = customTopic || topicSelect;

                settings.slot1Enabled = params.get('slot1Enabled') === 'true';
                settings.slot1Time = params.get('slot1Time') || '08:00';
                settings.slot1Type = params.get('slot1Type') || 'Important Board Topic (Notes)';
                settings.slot1Count = parseInt(params.get('slot1Count') || '1', 10);

                settings.slot2Enabled = params.get('slot2Enabled') === 'true';
                settings.slot2Time = params.get('slot2Time') || '18:00';
                settings.slot2Type = params.get('slot2Type') || 'WhatsApp Poll + Auto Answer';
                settings.slot2Count = parseInt(params.get('slot2Count') || '3', 10);

                saveConfig();
                addLog(`⏰ Schedule saved! Slot 1: ${settings.slot1Time} | Slot 2: ${settings.slot2Time}`);
                redirectTab = 'schedule';
                toast = '⏰ Schedule & Chapters save ho gaye!';
            } else if (pathname === '/send-now') {
                const chapters = params.getAll('chapters').filter(Boolean);
                const customTopic = (params.get('customTopic') || '').trim();
                const topicSelect = (params.get('topicSelect') || '').trim();
                const type = params.get('type') || 'WhatsApp Poll (MCQ)';
                const count = parseInt(params.get('count') || '1', 10);

                sendAIContent({
                    chapterIds: chapters.length > 0 ? chapters : settings.selectedChapters,
                    specificTopic: customTopic || topicSelect,
                    type,
                    count
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
                        if (!isLinked) return;
                        const nowIST = new Date().toLocaleTimeString('en-GB', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        });

                        if (settings.slot1Enabled && settings.slot1Time === nowIST && lastSlot1Minute !== nowIST) {
                            lastSlot1Minute = nowIST;
                            handleScheduledSlot('Slot 1', settings.slot1Type, settings.slot1Count);
                        }

                        if (settings.slot2Enabled && settings.slot2Time === nowIST && lastSlot2Minute !== nowIST) {
                            lastSlot2Minute = nowIST;
                            handleScheduledSlot('Slot 2', settings.slot2Type, settings.slot2Count);
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
