FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY frontend/ /app/frontend/
COPY data/ /app/data/

EXPOSE 5188

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5188"]
