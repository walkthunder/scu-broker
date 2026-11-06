FROM node:24.22.1-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/uploads
EXPOSE 3000
CMD ["sh", "-c", "node scripts/seed.js && node src/index.js"]
