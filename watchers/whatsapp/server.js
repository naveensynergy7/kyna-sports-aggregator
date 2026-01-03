const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const cors = require("cors");
const sendData = require("./sendData");

dotenv.config();

const app = express();

// Enable CORS for all routes (allows Green API and testing tools to access)
app.use(cors({
  origin: '*', // Allow all origins (you can restrict this to specific domains if needed)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

app.use(bodyParser.json());

// Log ALL incoming requests for debugging
app.use((req, res, next) => {
  console.log(`\n🔔 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('📥 Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Webhook processing function (shared between / and /webhook endpoints)
const processWebhook = async (req, res, endpoint) => {
  // Immediately send 200 OK to prevent timeout
  res.sendStatus(200);
  
  console.log(`✅ POST ${endpoint} received`);
  const body = req.body;

  const allowedUsers = ["incomingMessageReceived", "outgoingMessageReceived"];

  if (!allowedUsers.includes(body.typeWebhook)) {
    console.log(`⏭️  Skipping webhook type: ${body.typeWebhook || 'undefined'}`);
    return; // Already sent 200 OK above
  }

  const chatId = body?.senderData?.chatId;
  const senderId = body?.senderData?.sender;

  if (!chatId || !chatId.endsWith("@g.us")) {
    console.log(`⏭️  Skipping non-group chat. chatId: ${chatId}`);
    return; // Already sent 200 OK above
  }

  const cleanSenderId = senderId.replace("@c.us", "");

  const message = body?.messageData?.textMessageData?.textMessage;

  if (!message) {
    console.log(`⏭️  Skipping message without text content`);
    return; // Already sent 200 OK above
  }

  console.log("✅ Webhook HIT");
  console.log("Group Messages");
  console.log("Type :", body.typeWebhook);
  console.log("Group Id :", chatId);
  console.log("Sender :", cleanSenderId);
  console.log("Message :", message);
  // console.log(JSON.stringify(req.body, null, 2));
  if (body.typeWebhook === "quotaExceeded") {
    console.warn("⚠️ GREEN-API quota exceeded");
    return; // Already sent 200 OK above
  }

  // Process asynchronously after responding
  sendData(message, cleanSenderId).catch(err => {
    console.error('❌ Error sending data to parser queue:', err.message);
  });
};

// Handle preflight OPTIONS requests for both endpoints
app.options("/webhook", (req, res) => {
  console.log('✅ OPTIONS /webhook request received');
  res.sendStatus(200);
});

app.options("/", (req, res) => {
  console.log('✅ OPTIONS / request received');
  res.sendStatus(200);
});

// Webhook endpoint (for explicit /webhook path)
app.post("/webhook", async (req, res) => {
  await processWebhook(req, res, "/webhook");
});

// Root endpoint - Green API sends webhooks to / (root path)
app.post("/", async (req, res) => {
  await processWebhook(req, res, "/");
});

app.get("/", (req, res) => {
  res.send("server is live");
});

// Health check endpoint for monitoring
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Catch-all for debugging - log any other requests
app.use((req, res) => {
  console.log(`❓ Unknown request: ${req.method} ${req.path}`);
  res.status(404).send("Not found");
});

const port = process.env.PORT || 5000;
const host = process.env.HOST || '0.0.0.0'; // Bind to 0.0.0.0 to accept external connections

app.listen(port, host, () =>
  console.log(`Server is running on ${host}:${port}`)
);
