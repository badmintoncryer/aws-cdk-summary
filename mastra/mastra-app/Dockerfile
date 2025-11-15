FROM --platform=linux/arm64 node:22-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY mastra-app ./mastra-app
RUN npx mastra build

RUN groupadd -g 1001 nodejs && \
  useradd -r -u 1001 -g nodejs mastra && \
  chown -R mastra:nodejs /app

USER mastra

ENV PORT=8080
ENV IS_LOCAL=FALSE
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "run", "server"]
