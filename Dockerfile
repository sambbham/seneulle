# Threadly store — Node.js (Express) static site + JSON file storage.
# Store data (data/db.json, webhook-events.jsonl) lives on a volume mounted
# at /app/data — it is NOT baked into the image (it holds the admin password
# and customer data).

FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached unless package files change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the app source (excludes anything listed in .dockerignore).
COPY index.html admin.html server.js ./
COPY css ./css
COPY js ./js
COPY images ./images

# The app runs as the non-root "node" user and must be able to write the
# data directory (db.json + webhook-events.jsonl).
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
