FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_BUILD_SOURCE=unavailable
ARG VITE_BUILD_STARTED_AT=
ARG VITE_BUILD_COMPLETED_AT=
ARG VITE_BUILD_DURATION_MS=
ARG VITE_BUILD_COMMIT_SHA=
ARG VITE_BUILD_COMMIT_SHORT_SHA=
ARG VITE_BUILD_COMMIT_MESSAGE=
ARG VITE_BUILD_BRANCH=
ARG VITE_BUILD_REPOSITORY=
ARG VITE_BUILD_WORKFLOW_NAME=
ARG VITE_BUILD_RUN_ID=
ARG VITE_BUILD_RUN_NUMBER=
ARG VITE_BUILD_RUN_ATTEMPT=
ARG VITE_BUILD_RUN_URL=
ARG VITE_BUILD_ACTOR=
ARG VITE_BUILD_EVENT_NAME=

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .

RUN npm run build
RUN node scripts/write-build-info.mjs
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "@dglab-ai/server"]
