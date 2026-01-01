const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// Use PARSER_QUEUE_URL from environment, fallback to default
const API_URL = process.env.PARSER_QUEUE_URL 
  ? `${process.env.PARSER_QUEUE_URL}/parse`
  : "https://parser.kyna.one/parse";

const sendData = async (message, senderId) => {
  const payload = {
    message: message,
    platform: "whatsapp",
    contactUrl: senderId ? `https://wa.me/${senderId}` : null,
  };

  console.log(payload);

  try {
    const response = await axios.post(API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("Sent Api");
    console.log("Api response", response.data);
  } catch (error) {
    if (error.response) {
      console.log("Failed to sent api");
      console.log("Response:", error.response.data);
    } else {
      console.log(error.message);
    }
  }
};

module.exports = sendData;
