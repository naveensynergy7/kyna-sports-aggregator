# ================================
# Kyna Telegram Watcher - Dockerfile
# ================================

# Use official Node.js 20 LTS version with Alpine Linux (lightweight)
# Same base image as admin-dashboard, so Docker will reuse it (no extra download!)
FROM node:20-alpine

# Set metadata for the image (optional but good practice)
LABEL maintainer="Kyna Team"
LABEL description="Telegram Message Watcher for Kyna Sports Aggregator"

# Install build dependencies required for native Node.js modules
# Python3 is needed for node-gyp to compile native extensions (telegram package)
# make, g++ are needed for C++ compilation
RUN apk add --no-cache python3 make g++

# Set working directory inside the container
# All subsequent commands will run from this directory
WORKDIR /app

# Copy package.json and package-lock.json first
# Why separate from source code? For Docker layer caching optimization
# If only source code changes (not dependencies), Docker reuses this cached layer
COPY package*.json ./

# Install Node.js dependencies inside the container
# This creates node_modules/ inside the container
RUN npm install

# Install nodemon globally for development hot-reload
# Watches for file changes and auto-restarts the watcher
RUN npm install -g nodemon

# Copy all watcher source code to the container
# This includes: index.js, any utility files, etc.
COPY . .

# Expose port 3001 for the watcher control API
# This is the HTTP API that admin dashboard uses to reload/check watcher status
EXPOSE 3001

# Set environment variable for Node.js
# Tells the app it's in development mode
ENV NODE_ENV=development

# Default command to run when container starts
# npm run dev should use nodemon (defined in package.json)
# In production, you'd use: CMD ["npm", "start"] or CMD ["node", "index.js"]
CMD ["npm", "run", "dev"]

