# Production Dockerfile für Memory-optimierte Performance
FROM node:23-alpine

# Install Chromium und Memory-Management Tools
RUN apk add --no-cache \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    procps \
    htop \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

# Create app directory
WORKDIR /usr/src/app

# Create user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Configure Puppeteer to use system Chromium with memory optimizations
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_CACHE_DIR=/tmp/puppeteer-cache

# Node.js Memory-Optimierungen
ENV NODE_OPTIONS="--max-old-space-size=768 --expose-gc --optimize-for-size"

# Copy package files
COPY package*.json ./

# Install dependencies with production optimizations
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf ~/.npm

# Copy source code
COPY . .

# Clean up development files
RUN rm -rf .git .gitignore .dockerignore README.md && \
    rm -rf /tmp/* /var/tmp/*

# Create temp directories with proper permissions
RUN mkdir -p /tmp/puppeteer-cache && \
    chown -R nodejs:nodejs /tmp/puppeteer-cache

# Change ownership
RUN chown -R nodejs:nodejs .

# Switch to non-root user
USER nodejs

# Set default port
ENV PORT=3000

# Expose port
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/api/status || exit 1

# Start application with memory monitoring
CMD ["node", "--max-old-space-size=768", "--expose-gc", "extract-manager.js"]
