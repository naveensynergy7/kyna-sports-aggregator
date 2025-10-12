/**
 * OpenAI Parser Queue Client
 * A simple client library for sending messages to the parser queue
 */

const axios = require('axios');

class ParserClient {
  constructor(baseUrl = 'http://localhost:3002') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Send a message to the parser queue
   * @param {string} message - The message text to parse
   * @param {string} platform - Platform name (telegram, whatsapp, facebook, discord, slack)
   * @param {string} [contactUrl] - Contact URL if available
   * @returns {Promise<Object>} Response with jobId
   */
  async parseMessage(message, platform, contactUrl = null) {
    try {
      const response = await this.client.post('/parse', { 
        message, 
        platform, 
        contactUrl 
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Parser API Error: ${error.response.data.error || error.response.statusText}`);
      } else if (error.request) {
        throw new Error('Parser API is not reachable');
      } else {
        throw new Error(`Request setup error: ${error.message}`);
      }
    }
  }
}

module.exports = ParserClient;
