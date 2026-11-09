FROM node:24-alpine

WORKDIR /app

COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 4000

# Applies migrations and loads demo data if the database is empty, then starts the API.
CMD ["npm", "run", "start:deploy"]
