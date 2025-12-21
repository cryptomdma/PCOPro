FROM node:18-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps || npm install
COPY . .
RUN npm run prisma:generate || true
RUN npm run build || true
CMD ["npm", "run", "start:dev"]
