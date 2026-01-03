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

// Handle preflight OPTIONS requests
app.options("/webhook", (req, res) => {
  console.log('✅ OPTIONS request received');
  res.sendStatus(200);
});

app.post("/webhook", async (req, res) => {
  // Immediately send 200 OK to prevent timeout
  res.sendStatus(200);
  
  console.log('✅ POST /webhook received');
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
});

app.get("/", (req, res) => {
  res.send("server is live");
});

// Catch-all for debugging - log any other requests
app.use((req, res) => {
  console.log(`❓ Unknown request: ${req.method} ${req.path}`);
  res.status(404).send("Not found");
});

const port = process.env.PORT || 5000;
app.listen(port, () =>
  console.log("Server is running on Port:", port)
);
