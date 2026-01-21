# Usar imagen base de Node.js
FROM node:20-alpine

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
