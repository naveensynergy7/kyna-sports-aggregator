# Use Node.js 20 Alpine as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Install nodemon globally for development
RUN npm install -g nodemon

# Copy application files
COPY . .

# Expose port
EXPOSE 3001

# Start application
CMD ["npm", "run", "dev"]

