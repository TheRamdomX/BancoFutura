FROM node:20-alpine

WORKDIR /app

# Instalar dependencias declaradas en package.json (fuente única de verdad)
COPY package.json ./
RUN npm install --legacy-peer-deps

# Copiar el resto del código fuente
COPY . .

EXPOSE 8081

# Expo Web en red local (evita --tunnel que reporta fallas)
CMD ["npx", "expo", "start", "--web", "--host", "lan"]
