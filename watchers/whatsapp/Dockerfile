# ================================
# WhatsApp Watcher - Dockerfile
# ================================

# Use official Node.js 20 LTS version with Alpine Linux
FROM node:20-alpine

# Set metadata for the image
LABEL maintainer="Kyna Team"
LABEL description="WhatsApp Watcher using Green API webhooks"

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (for Docker layer caching)
COPY package*.json ./

# Install Node.js dependencies inside the container
RUN npm install

# Copy all application source code to the container
COPY . .

# Expose port 5000 (default port for the webhook server)
EXPOSE 5000

# Set environment variable for Node.js
ENV NODE_ENV=production

# Default command to run when container starts
CMD ["npm", "start"]

