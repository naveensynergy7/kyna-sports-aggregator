# ================================
# Kyna Admin Dashboard - Dockerfile
# ================================

# Use official Node.js 20 LTS version with Alpine Linux (lightweight, ~120MB vs ~900MB for regular)
FROM node:20-alpine

# Set metadata for the image (optional but good practice)
LABEL maintainer="Kyna Team"
LABEL description="Admin Dashboard for Kyna Sports Aggregator"

# Install build dependencies required for native Node.js modules
# Python3 is needed for node-gyp to compile native extensions
# make, g++ are needed for C++ compilation
RUN apk add --no-cache python3 make g++

# Set working directory inside the container
# All subsequent commands will run from this directory
WORKDIR /app

# Copy package.json and package-lock.json first (before copying source code)
# Why? Docker caches layers. If dependencies don't change, this layer is reused
# This makes rebuilds MUCH faster when you only change code
COPY package*.json ./

# Install Node.js dependencies inside the container
# This runs npm install in the container, not on your host machine
RUN npm install

# Install nodemon globally for development hot-reload
# This allows code changes to auto-restart the server
RUN npm install -g nodemon

# Copy all application source code to the container
# This includes: routes/, views/, config/, middleware/, etc.
COPY . .

# Expose port 3000 to the host machine
# This doesn't actually publish the port, just documents which port the app uses
# Actual publishing happens in docker-compose.yml with "ports: 3000:3000"
EXPOSE 3000

# Set environment variable for Node.js
# This tells the app it's running in development mode
ENV NODE_ENV=development

# Default command to run when container starts
# Using npm run dev which should use nodemon for auto-reload
# In production, you'd use: CMD ["npm", "start"]
CMD ["npm", "run", "dev"]

