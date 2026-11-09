FROM node:24-alpine

WORKDIR /app

# Prisma's migration engine needs OpenSSL, which the Alpine image leaves out.
RUN apk add --no-cache openssl

COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 4000

# Applies migrations and loads demo data if the database is empty, then starts the API.
CMD ["npm", "run", "start:deploy"]
