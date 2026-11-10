const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoint to fetch prediction safely without CORS issues
app.get('/api/get-prediction', async (req, res) => {
    try {
        const response = await fetch('https://prediction-01c9.onrender.com/api/prediction', {
            headers: { 'Cache-Control': 'no-cache' }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch prediction from API', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
