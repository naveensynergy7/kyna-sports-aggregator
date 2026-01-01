const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const sendData = require("./sendData");

dotenv.config();

const app = express();
app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  const body = req.body;

  const allowedUsers = ["incomingMessageReceived", "outgoingMessageReceived"];

  if (!allowedUsers.includes(body.typeWebhook)) {
    return res.sendStatus(200);
  }

  const chatId = body?.senderData?.chatId;
  const senderId = body?.senderData?.sender;

  if (!chatId || !chatId.endsWith("@g.us")) {
    return res.sendStatus(200);
  }

  const cleanSenderId = senderId.replace("@c.us", "");

  const message = body?.messageData?.textMessageData?.textMessage;

  if (!message) {
    return res.sendStatus(200);
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
    return res.sendStatus(200);
  }

  await sendData(message, cleanSenderId);

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("server is live");
});

const port = process.env.PORT || 5000;
app.listen(port, () =>
  console.log("Server is running on Port:", port)
);
