# Usar imagen base de Node.js (Debian slim - compatible con Prisma)
FROM node:20-slim

# Instalar OpenSSL (requerido por Prisma)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production && npm install -g nodemon

# Copiar el resto del código
COPY . .

# Generar cliente Prisma
RUN npx prisma generate

# Exponer puerto
EXPOSE 3001

# Comando de inicio
CMD ["npm", "start"]
