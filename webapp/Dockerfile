FROM public.ecr.aws/docker/library/node:22-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# Build application
COPY . .
RUN pnpm run build

# Production image
FROM public.ecr.aws/docker/library/node:22-slim AS runner

WORKDIR /app

# Install Lambda Web Adapter
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4-aarch64 /lambda-adapter /opt/extensions/lambda-adapter

# Environment variables for Lambda Web Adapter
ENV PORT=3000
ENV AWS_LWA_INVOKE_MODE=response_stream
ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

CMD ["node", "server.js"]
