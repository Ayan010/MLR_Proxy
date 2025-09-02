const express = require("express");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { readOCRFromImage } = require('./read-file'); // Import the OCR function
// const fetch = require("node-fetch");

dotenv.config();

const app = express();
app.use(express.json());
app.use(morgan("tiny"));

const PORT = process.env.PORT || 3000;
const AZURE_API_KEY = process.env.AZURE_API_KEY;
const AZURE_RESOURCE = process.env.AZURE_RESOURCE;
const AZURE_API_VERSION = process.env.AZURE_API_VERSION;
const MODEL_MAP = JSON.parse(process.env.MODEL_MAP);
const PROXY_API_KEY = process.env.PROXY_API_KEY;
const EMBEDDING_DEPLOYMENT = process.env.EMBEDDING_DEPLOYMENT;


app.get("/welcome", (req, res) => {
  res.json("Welcome to Azure OpenAI Proxy Server");
});



app.get("/v1/ocr", async (req, res) => {
  try {
    const imagePath = req.query.imagePath; // Use query parameters for GET
    if (!imagePath) {
      return res.status(400).json({ error: "Image path is required" });
    }

    console.log("OCR request received for image:", imagePath);

    const text = await new Promise((resolve, reject) => {
      readOCRFromImage(imagePath, (err, extractedText) => {
        if (err) return reject(err);
        resolve(extractedText);
      });
    });

    res.json({ text });
  } catch (err) {
    console.error("Error during OCR processing:", err);
    res.status(500).json({ error: "OCR processing failed" });
  }
});

app.use((req, res, next) => {
    console.log("incoming request ==> ", req.method, req.url);
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

    if(PROXY_API_KEY && token !== PROXY_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
})

app.get("/v1/models", (req, res) => {
  const data = Object.keys(MODEL_MAP).map(id => ({
    id,
    object: "model",
    created: Date.now() / 1000,
    owned_by: "azure-proxy"
  }));

  console.log("Models requested, returning:", data);
  res.json({ object: "list", data });
});


app.post("/v1/chat/completions", async (req, res) => {
  try {

    console.log("Chat completion request received ==> ", req.body);
    const { model, ...rest } = req.body;
    const deployment = MODEL_MAP[model];
    if (!deployment) throw new Error(`No mapping for model ${model}`);

    const url = `https://${AZURE_RESOURCE}.openai.azure.com/openai/deployments/${deployment}/chat/completions?api-version=${AZURE_API_VERSION}`;
    const azureResp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_API_KEY
      },
      body: JSON.stringify({ ...rest })
    });

    console.log("Azure response status ==> ", azureResp);
    const text = await azureResp.text();
    res.status(azureResp.status).type("application/json").send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.post("/v1/embeddings", async (req, res) => {
  try {
    // Azure ignores "model" field, so we can strip it
    const { model, ...body } = req.body;
    const azureUrl = `https://${AZURE_RESOURCE}.openai.azure.com/openai/deployments/${model}/embeddings?api-version=${AZURE_API_VERSION}`;

    console.log("Embeddings request received ==> ", model, body);
    console.log("Forwarding to Azure URL ==> ", azureUrl);

    const response = await fetch(azureUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Embeddings proxy error:", err);
    res.status(500).json({ error: "Proxy failed" });
  }
});



app.listen(PORT, () => {
  console.log(`Proxy running at http://localhost:${PORT}`);
});
