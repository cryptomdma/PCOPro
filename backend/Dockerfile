FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps || npm install
COPY . .
RUN npm run prisma:generate || true
RUN npm run build || true
CMD ["npm", "run", "start:dev"]
