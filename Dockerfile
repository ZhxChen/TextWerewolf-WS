FROM node:20-alpine AS app
WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source, shared enums, and pre-built frontend
COPY server/ ./server/
COPY shared/ ./shared/
COPY client/dist/ ./client/dist/

EXPOSE 6100
CMD ["node", "server/src/app.js"]
