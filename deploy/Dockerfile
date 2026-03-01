FROM node:20-alpine

RUN apk add --no-cache tzdata postgresql16 postgresql16-contrib su-exec bash
ENV TZ=Asia/Jakarta
RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime \
 && echo "$TZ" > /etc/timezone

ENV PGDATA=/var/lib/postgresql/data

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund --prefer-offline

COPY . .
RUN npm run build

RUN mkdir -p /app/uploads
RUN mkdir -p /var/lib/postgresql/data /run/postgresql /var/log \
    && chown -R postgres:postgres /var/lib/postgresql /run/postgresql

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
