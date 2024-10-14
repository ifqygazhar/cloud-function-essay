require('dotenv').config();
const functions = require('firebase-functions');
const { ChatOpenAI } = require("@langchain/openai");
const helmet = require('helmet');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(helmet());
const port = 8000;

const llm = new ChatOpenAI({
  model: "gpt-4",
  temperature: 0.5,
  maxTokens: undefined,
  timeout: undefined,
  maxRetries: 2,
  apiKey: "apikey",
});

// Mengizinkan CORS untuk semua origin
app.use(cors());

// Middleware untuk meng-handle request body dalam format JSON
app.use(express.json());

// Data untuk menyimpan hasil analisis berdasarkan requestId
let results = {};

// Dummy data structure sebagai template
const dummyDataStructure = {
  "mistakes": []
};

app.get('/result/:requestId', (req, res) => {
  const { requestId } = req.params;
  if (results[requestId]) {
    res.json(results[requestId]);
  } else {
    res.status(404).json({ error: "Result not found." });
  }
});

app.post('/analyze', async (req, res) => {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided." });
    }
  
    try {
      // Generate UUID untuk setiap request
      const requestId = uuidv4();
  
      // Panggil OpenAI untuk menganalisis teks dengan format chat (messages)
      const response = await llm.call([
        {
          role: 'user',
          content: `Please analyze the following text for grammatical errors and corrections, and provide the results in the following JSON format:
          {
            "grade" : "a grade between 1 and 5 based on grammatical accuracy, with 1 being the lowest and 5 being the highest, format output 1/5",
            "mistakes": [
              {
                "mistake": "word with mistake",
                "location": "context where mistake occurs",
                "correction": "correct word",
                "error_type": "type of error (e.g., Subject-Verb Agreement, Verb Tense)",
                "rule": "a fun or easy-to-understand explanation of the rule"
              }
            ]
          }
          Text: ${text}`
        }
      ]);
  
      // Parse hasil dari OpenAI menjadi format JSON
      const aiResponse = JSON.parse(response.content); // 'response.content' adalah string hasil dari OpenAI
  
      // Simpan hasil ke dalam objek results berdasarkan requestId
      results[requestId] = aiResponse || dummyDataStructure;
  
      // Kembalikan requestId ke klien agar bisa mengambil hasil nanti
      res.json({ requestId });
    } catch (error) {
      console.error("Error during text analysis:", error);
      res.status(500).json({ error: "Error processing the text." });
    }
  });

  app.post("/ai_analyze", async (req, res) => {
    const { texts } = req.body; // Mengharapkan beberapa potongan teks
  
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: "Invalid input. Please provide an array of texts." });
    }
  
    try {
      // Generate unique requestId
      const requestId = uuidv4();
  
      // Inisialisasi array untuk menyimpan hasil analisis per teks
      const analysisData = [];
  
      // Loop melalui setiap teks yang diberikan oleh user
      for (const text of texts) {
        // Panggil OpenAI untuk setiap teks
        const response = await llm.call([
          {
            role: "user",
            content: `
              Please analyze the following text and provide results in this JSON format:
              {
                "part": "${text}",
                "positive": "provide an analysis of the text",
                "improvement_suggestions": "suggestions for improvement"
              }
              Text: ${text}
            `
          }
        ]);
        
  
        // Parse hasil dari OpenAI menjadi format JSON
        const aiResponse = JSON.parse(response.content);
  
        // Tambahkan hasil analisis ke dalam array analysisData
        analysisData.push(aiResponse);
      }
  
      // Setelah semua bagian dianalisis, mintalah analisis keseluruhan
      const overallResponse = await llm.call([
        {
          role: "user",
          content: `
            Please provide an overall analysis of the following texts:
            ${texts.join(' ')}
            Provide the overall analysis in this format:
            {
              "overall_analysis": "provide an overall analysis of the entire text",
              "improve_analysis":  "Improve analysis of all the texts"
            }
          `
        }
      ]);
  
      // Parse hasil dari OpenAI menjadi format JSON untuk overall analysis
      const overallAnalysis = JSON.parse(overallResponse.content);
  
      // Struktur akhir dari respons
      const finalResponse = {
        "ai_analysis": {
          "data": analysisData,
          "overall_analysis": overallAnalysis.overall_analysis || "Overall analysis of all the texts.",
          "improve_analysis": overallAnalysis.improve_analysis  ||  "Improve analysis of all the texts"
        }
      };
  
      // Simpan hasil ke dalam objek results berdasarkan requestId
      results[requestId] = finalResponse;
  
      // Kembalikan requestId ke klien agar mereka bisa mengambil hasil nanti
      res.json({ requestId });
    } catch (error) {
      console.error("Error during text analysis:", error);
      res.status(500).json({ error: "Error processing the text." });
    }
  });
  
  
  app.get('/result/ai_analyze/:requestId', (req, res) => {
    const { requestId } = req.params;
  
    // Cek apakah hasil dengan requestId yang diminta tersedia
    if (results[requestId]) {
      res.json(results[requestId]);
    } else {
      res.status(404).json({ error: "Result not found." });
    }
  });

// Menangani preflight (OPTIONS) request
app.options('*', cors());

// Mengekspos aplikasi Express sebagai Firebase Cloud Function
exports.app = functions.https.onRequest(app);
