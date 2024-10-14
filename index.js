// functions/index.js

const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const { ChatOpenAI } = require("@langchain/openai");
const { PromptTemplate } = require("@langchain/core/prompts");


// Initialize Express app
const app = express();

// Apply middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

const openaiApiKey = "API-KEY";  // Add your actual key here

// Initialize ChatOpenAI with LangChain
const model = new ChatOpenAI({
  openAIApiKey: openaiApiKey,
  modelName: "o1-mini",
  temperature: 1,
});

// In-memory storage for results (optional if using Firestore)
let results = {};

// Helper function to escape curly braces
function escapeBraces(str) {
  return str.replace(/{/g, '{{').replace(/}/g, '}}');
}

function validateJSON(jsonString) {
  try {
    // Remove unwanted characters such as markdown or extra non-JSON text
    const cleanedJsonString = jsonString
      .replace(/```(?:json)?/g, '')  // Remove ```json or ``` markers
      .replace(/\n/g, '')             // Remove newlines
      .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
      .trim();                        // Remove leading and trailing spaces


    const parsed = JSON.parse(cleanedJsonString);
    return parsed;
  } catch (error) {
    console.error("Invalid JSON response:", error);
    throw new Error("Failed to parse JSON response from the model.");
  }
}

// Function to evaluate the essay
async function evaluateEssay(text) {
  const evaluationJsonTemplate = `
  {{
    "grade": "",
    "mistakes": [
        {{
          "mistake": "",
          "location": "",
          "correction": "",
          "explanation": "",
          "error_type": "",
          "rule": ""
        }}
      ]
  }}`;

  const promptTemplate = new PromptTemplate({
    template: `Evaluate the following essay {text}, providing a grade from 1 to 5 like 2/5 and highlighting all grammar and orthographic mistakes.

For each mistake, return the mistake, the full sentence (location) where the mistake occurs, and the correction.
Also provide an explanation for why it's wrong, the type of error (e.g., Subject-Verb Agreement, Tense, etc.), and the grammar rule that applies.
Strictly return valid JSON. No other text should be included in the response.
Essay:
{text}

Your response must follow this JSON structure:
${evaluationJsonTemplate}`,
    inputVariables: ["text"],
  });

  const formattedPrompt = await promptTemplate.format({ text });
  const messages = [{ role: "user", content: formattedPrompt }];
  const rawResult = await model.call(messages);

  const evaluation = validateJSON(rawResult.content);
  return evaluation;
}

// Function to analyze the semantic parts of the essay
async function analyzeSemanticParts(text, evaluation) {
  const analyzeSemanticPartsJson = `
  {{
    "data": [
      {{
        "part": "",
        "feedback": {{
          "positive": "",
          "improvement_suggestions": ""
        }}
      }}
    ],
    "overall_analysis": "",
    "improved_text": ""
  }}`;

  const escapedEvaluation = escapeBraces(JSON.stringify(evaluation, null, 2));

  const promptTemplate = new PromptTemplate({
    template: `Perform an in-depth analysis of the following essay {text}:
Essay:
{text}

1. Split the essay into 4-8 distinct semantic parts.
2. For each part, provide detailed feedback on:
   - What the user got right (structure, content, and argumentation).
   - What the user got wrong or could improve.
   - Provide specific suggestions on how to improve each part.
3. Include a light grammar and orthographic review based on this previous evaluation:
${escapedEvaluation}
4. Provide an overall analysis of the entire essay, summarizing strengths and weaknesses.
5. Generate an improved version of the essay.

Strictly return valid JSON in the following structure:
${analyzeSemanticPartsJson}`,
    inputVariables: ["text"],
  });

  const formattedPrompt = await promptTemplate.format({ text });
  const messages = [{ role: "user", content: formattedPrompt }];
  const rawResult = await model.call(messages);

  const semanticAnalysis = validateJSON(rawResult.content);
  return semanticAnalysis;
}

// Define the /analyze endpoint
app.post('/analyze', async (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Essay text is required' });
  }

  try {
    // Evaluate the essay first
    const evaluation = await evaluateEssay(text);
    
    // Perform semantic analysis using the evaluation result
    const semanticAnalysis = await analyzeSemanticParts(text, evaluation);

    // Store the result (optional if using Firestore or another database)
    results = {
      evaluation,
      semanticAnalysis,
      createdAt: new Date().toISOString(),
    };

    // Return the combined result to the user
    res.json({
      evaluation,
      semanticAnalysis
    });
  } catch (error) {
    console.error('Error processing essay:', error);
    res.status(500).json({ error: 'Failed to analyze the essay.' });
  }
});



// Export the app as a Firebase Cloud Function
exports.dummy = functions.https.onRequest(app);
