FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps || npm install
COPY . .
RUN npm run build || true
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
