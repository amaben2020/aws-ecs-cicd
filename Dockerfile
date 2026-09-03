# ==========================================
# STAGE 1: Build & Dependency Installation
# ==========================================
FROM node:20-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package files first to leverage Docker's cache layers
COPY package*.json ./

# Install ALL dependencies (including devDependencies like TypeScript, build tools, etc.)
RUN npm ci

# Copy the rest of your application source code
COPY . .

# Optional: Run your build step if you use TypeScript, Next.js, Vite, etc.
# Remove the '#' from the line below if your app requires a build step.
# RUN npm run build

# ==========================================
# STAGE 2: Production Runtime Environment
# ==========================================
FROM node:20-alpine AS runner

# Set the working directory
WORKDIR /app

# Set Node environment to production
ENV NODE_ENV=production

# Copy only the necessary package files
COPY package*.json ./

# Install ONLY production dependencies to keep the image slim
RUN npm ci --only=production

# Copy built artifacts and necessary source files from the builder stage
# (Adjust "dist" or "." depending on whether you have a build/compilation step)
COPY --from=builder /app/dist ./dist
# If you don't have a compilation step, uncomment the line below to copy source files instead:
# COPY --from=builder /app/src ./src

# Expose the port your app listens on
EXPOSE 5500

# Start the application
CMD ["node", "dist/index.js"]
