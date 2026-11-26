const http = require('http');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const cron = require('node-cron');
const { GoogleGenAI } = require('@google/genai');

// Render ko 24/7 active rakhne ke liye
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Arpit Class 10 Quiz Bot is Running 24/7!');
}).listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Details
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY || 'AQ.Ab8RN6ImoJcdbJFs8vnUOSY_59MyUfWGAPjGscIRE1VjpuyjZw' 
});
const PHONE_NUMBER = '918601975828';
const GROUP_NAME = 'Arpit';

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    // 8-digit Pairing Code generate karne ke liye
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            const code = await sock.requestPairingCode(PHONE_NUMBER);
            console.log('\n👉 Aapka WhatsApp Pairing Code:', code, '\n');
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;

        if (connection === 'close') {
            console.log('Connection toot gaya, dobara connect kar raha hu...');
            startBot();
        }

        if (connection === 'open') {
            console.log('✅ Bot WhatsApp se connect ho gaya hai!');

            // Roz subah 8 baje aur shaam 6 baje (Indian Time)
            cron.schedule('0 8,18 * * *', async () => {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    const targetGroup = Object.values(groups).find(g => g.subject === GROUP_NAME);

                    if (!targetGroup) {
                        console.log('❌ Group "Arpit" nahi mila!');
                        return;
                    }

                    const prompt = `Class 10 UP/CBSE Board Exam (Science, Maths, SST ya Hindi) ka ek important MCQ question banao Hindi/Hinglish mein.
Format:
📚 *Class 10 Important Quiz*
*Question:* [Sawal]
A) [Option 1]
B) [Option 2]
C) [Option 3]
D) [Option 4]
(Answer mat likhna, sirf question aur options dena)`;

                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: prompt,
                    });

                    await sock.sendMessage(targetGroup.id, { text: response.text });
                    console.log('✅ Class 10 Quiz "Arpit" group mein bhej diya gaya!');
                } catch (err) {
                    console.error('Error:', err);
                }
            }, {
                timezone: "Asia/Kolkata"
            });
        }
    });
}

startBot();
  
