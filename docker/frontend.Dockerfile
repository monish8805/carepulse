# syntax=docker/dockerfile:1
# One Dockerfile for all three portals: they are built and served identically and
# differ only by folder name. Build from the repo root:
#   docker build -f docker/frontend.Dockerfile --build-arg APP=patient-frontend .
ARG APP=patient-frontend

FROM node:22-alpine AS build
ARG APP
# Public URL the browser calls the backend on. It is compiled into the JS bundle at
# build time (Vite), so it is not a secret and must never be one.
ARG VITE_API_URL=http://localhost:5001
WORKDIR /repo
# Manifests first so `npm ci` stays cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY patient-frontend/package.json patient-frontend/
COPY hospital-frontend/package.json hospital-frontend/
COPY owner-frontend/package.json owner-frontend/
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
COPY packages/portal/package.json packages/portal/
COPY e2e/package.json e2e/
RUN npm ci --workspace ${APP} --include-workspace-root
COPY packages packages
COPY ${APP} ${APP}
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build --workspace ${APP}

# Unprivileged nginx: runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG APP
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/${APP}/dist/client /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
