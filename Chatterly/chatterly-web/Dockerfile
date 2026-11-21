# Use Node.js
FROM node:20

# Set working directory
WORKDIR /app

# Copy backend code
COPY backend ./backend

# Copy frontend code
COPY frontend ./frontend

# Install backend dependencies
WORKDIR /app/backend
RUN npm install

# Install frontend dependencies & build
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Go back to backend
WORKDIR /app/backend

# Expose port
EXPOSE 5000

# Start backend
CMD ["npm", "start"]
