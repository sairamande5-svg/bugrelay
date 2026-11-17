FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
WORKDIR /app
COPY package*.json ./
RUN npm ci && npx playwright install --with-deps chromium
COPY . .
RUN npm run build && mkdir -p /app/data && chown -R node:node /app
USER node
ENV BUGRELAY_MODE=local BUGRELAY_CONTAINER=1 HOST=0.0.0.0 BUGRELAY_DATA=/app/data
CMD ["npm", "start"]
