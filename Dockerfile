# Build the Vite SPA, then run Express which serves /api and the static files.
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api
ARG VITE_STREAM_API_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_STREAM_API_KEY=$VITE_STREAM_API_KEY
RUN npm run build

FROM node:20-alpine AS backend
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /frontend/dist ./frontend/dist
ENV NODE_ENV=production
ENV PORT=5001
EXPOSE 5001
CMD ["node", "server.js"]
