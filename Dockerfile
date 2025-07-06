# Production Dockerfile
FROM node:23-alpine

# Install Chromium and dependencies
RUN apk add --no-cache \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /usr/src/app

# Create user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Configure Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create extracted directory
RUN mkdir -p extracted && chown -R nodejs:nodejs extracted

# Change ownership
RUN chown -R nodejs:nodejs .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || exit 1

# Start application
CMD ["npm", "start"]
