# 狼人杀

实时多人在线狼人杀游戏。

## 推荐部署方式：Docker Compose

项目镜像已通过 GitHub Workflow 构建并发布到 GitHub Container Registry：

```text
ghcr.io/zhxchen/textwerewolf-ws:latest
```

推荐使用 Docker Compose 一键部署应用和 MongoDB。

### 1. 创建 `docker-compose.yml`

```yaml
services:
  mongodb:
    image: mongo:7
    container_name: werewolf-mongo
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: werewolf_admin
      MONGO_INITDB_ROOT_PASSWORD: change-this-mongo-password
      MONGO_INITDB_DATABASE: werewolf
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    image: ghcr.io/zhxchen/textwerewolf-ws:latest
    container_name: werewolf-app
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 6100
      MONGODB_URI: mongodb://werewolf_admin:change-this-mongo-password@mongodb:27017/werewolf?authSource=admin
      JWT_SECRET: change-this-jwt-secret
      CRYPTO_SECRET: change-this-crypto-secret
      CORS_ORIGIN: "*"
    depends_on:
      mongodb:
        condition: service_healthy
    ports:
      - "6100:6100"

volumes:
  mongo_data:
```

### 2. 修改密钥和密码

请至少修改以下配置：

| 配置项 | 说明 |
| --- | --- |
| `MONGO_INITDB_ROOT_PASSWORD` | MongoDB root 密码 |
| `MONGODB_URI` | MongoDB 连接地址，密码需要和上面保持一致 |
| `JWT_SECRET` | JWT 签名密钥 |
| `CRYPTO_SECRET` | 数据加密密钥 |
| `CORS_ORIGIN` | 允许访问的前端来源，反代部署时建议改成你的域名 |

### 3. 启动服务

```bash
docker compose up -d
```

启动后访问：

```text
http://服务器IP:6100
```

首次启动时会自动创建管理员账号：

| 用户名 | 密码 |
| --- | --- |
| `admin` | `123456` |

建议登录后尽快修改默认密码，或在生产环境中自行调整初始化逻辑。

## 使用 Nginx 反向代理与 HTTPS

生产环境建议使用 Nginx 反向代理到应用容器的 `6100` 端口，并通过 TLS/SSL 提供 HTTPS 访问。

### Nginx 配置示例

如果 Docker Compose 将应用端口映射为：

```yaml
ports:
  - "6100:6100"
```

则宿主机 Nginx 可以这样配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy no-referrer-when-downgrade;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:6100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:6100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
}
```

反代部署时建议将应用环境变量改为：

```yaml
CORS_ORIGIN: "https://your-domain.com"
```

如果不希望应用端口直接暴露给公网，可以只在本机监听：

```yaml
ports:
  - "127.0.0.1:6100:6100"
```

## 使用外部 MongoDB

如果不想用 Docker Compose 部署 MongoDB，可以只运行应用容器，并把 `MONGODB_URI` 指向已有 MongoDB 服务。

### 方式一：Docker Compose 只部署应用

```yaml
services:
  app:
    image: ghcr.io/zhxchen/textwerewolf-ws:latest
    container_name: werewolf-app
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 6100
      MONGODB_URI: mongodb://username:password@mongo-host:27017/werewolf?authSource=admin
      JWT_SECRET: change-this-jwt-secret
      CRYPTO_SECRET: change-this-crypto-secret
      CORS_ORIGIN: "https://your-domain.com"
    ports:
      - "127.0.0.1:6100:6100"
```

### 方式二：直接运行 Docker 容器

```bash
docker run -d \
  --name werewolf-app \
  --restart unless-stopped \
  -p 127.0.0.1:6100:6100 \
  -e NODE_ENV=production \
  -e PORT=6100 \
  -e MONGODB_URI='mongodb://username:password@mongo-host:27017/werewolf?authSource=admin' \
  -e JWT_SECRET='change-this-jwt-secret' \
  -e CRYPTO_SECRET='change-this-crypto-secret' \
  -e CORS_ORIGIN='https://your-domain.com' \
  ghcr.io/zhxchen/textwerewolf-ws:latest
```

常见 MongoDB 连接示例：

```text
# 使用账号密码，认证库为 admin
mongodb://username:password@mongo-host:27017/werewolf?authSource=admin

# MongoDB Atlas / 云数据库通常使用 SRV 地址
mongodb+srv://username:password@cluster.example.mongodb.net/werewolf
```

请确保应用容器所在机器可以访问 MongoDB 地址，并且 MongoDB 防火墙或白名单允许该机器连接。

## 致谢

本项目参考了 [gy-lrs-lcoco2](https://github.com/guyang66/gy-lrs-lcoco2) 的狼人杀简化实现。

## 许可证

MIT
