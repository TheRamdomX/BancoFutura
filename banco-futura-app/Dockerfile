FROM node:20-alpine

WORKDIR /app

# Generamos package base e instalamos las dependencias clásicas de React Native / Expo Web
RUN npm init -y && \
    npm pkg set main="App.tsx" && \
    npm install react react-dom react-native-web expo @expo/metro-runtime @react-navigation/native @react-navigation/native-stack surrealdb.js react-native-safe-area-context react-native-screens zustand @google/genai && \
    npm install -g @expo/ngrok && \
    npm install -D typescript @types/react @types/react-native

RUN npx tsc --init

# Copiamos todo el código fuente del frontend
COPY . .

EXPOSE 8081

# Cambiando la ejecución de expo para correr en red local pura en vez de usar --tunnel que reporta fallas
CMD ["npx", "expo", "start", "--web", "--host", "lan"]
