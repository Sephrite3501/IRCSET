# server/Dockerfile
FROM node:20

# Set working dir
WORKDIR /app

# Copy package.json and install deps
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY src ./src

# Create uploads dir
RUN mkdir -p /app/uploads

EXPOSE 3001
CMD ["npm", "start"]
