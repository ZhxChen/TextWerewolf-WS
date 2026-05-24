# 狼人杀

实时多人在线狼人杀游戏。后端 Koa2 + Socket.IO + MongoDB，前端 React + Zustand。

## 快速启动（Docker）

### 1. 克隆项目

```bash
git clone <repo-url> werewolf
cd werewolf
```

### 2. 构建前端

需要 Node.js 18+ 环境：

```bash
cd client
npm install
npm run build
cd ..
```

构建产物会生成在 `client/dist/` 目录，Docker 中 nginx 会直接使用。

### 3. 配置环境变量

```bash
cp docker-compose.example.yml docker-compose.yml
```

编辑 `docker-compose.yml`，将 `<your-xxx>` 占位符替换为你自己的值：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `MONGO_INITDB_ROOT_USERNAME` | MongoDB 用户名 | `werewolf_admin` |
| `MONGO_INITDB_ROOT_PASSWORD` | MongoDB 密码 | 自定义强密码 |
| `MONGODB_URI` | MongoDB 连接串，需与上面的用户名密码一致 | `mongodb://werewolf_admin:密码@mongodb:27017/werewolf?authSource=admin` |
| `JWT_SECRET` | JWT 签名密钥 | 随机字符串 |
| `CRYPTO_SECRET` | 数据加密密钥 | 随机字符串 |
| `CORS_ORIGIN` | 允许的跨域来源，`*` 为不限制 | `*` 或 `https://your-domain.com` |

生成随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. 启动服务

```bash
docker compose up -d --build
```

启动后访问 http://localhost 即可。

### 5. 初始化测试账号（可选）

```bash
node scripts/seed.js
```

创建以下默认账号（密码均为 `123456`）：

| 账号 | 角色 | 说明 |
|------|------|------|
| `admin` | 管理员 | 可创建房间、管理用户 |
| `test1` ~ `test3` | 普通玩家 | 用于测试 |

## 生产环境部署

Docker 启动后，通过宿主机 nginx 反向代理并配置 SSL。

### 安装 certbot 申请证书

```bash
# Ubuntu/Debian
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

### 宿主机 nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 安全响应头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 前端静态文件（指向 Docker 中 nginx 暴露的端口，或直接代理到 Docker 内网）
    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:6100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 反向代理
    location /socket.io/ {
        proxy_pass http://127.0.0.1:6100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果宿主机 nginx 直接代理到 Docker 内部（不暴露端口到宿主机），可将 `proxy_pass` 改为 Docker 内网地址，例如 `proxy_pass http://172.17.0.1:6100`，或使用 `docker network` 方式连接。

## 本地开发

### 后端

```bash
cd server
cp ../server/.env.example .env   # 编辑 .env 配置 MongoDB 连接等
npm install
npm run dev                      # 启动开发服务器，端口 6100
```

需要本地 MongoDB 实例（默认 `localhost:27017`）。

### 前端

```bash
cd client
npm install
npm run dev                      # 启动开发服务器，端口 5173
```

开发模式下前端会自动代理 `/api` 和 `/socket.io` 请求到后端 6100 端口。

## 项目结构

```
werewolf/
├── shared/                # 共享枚举和常量（角色、阶段、技能）
├── server/                # Koa2 后端
│   └── src/
│       ├── config/        # 配置与常量
│       ├── controllers/   # 请求处理
│       ├── middleware/     # 认证、错误处理
│       ├── models/        # Mongoose 数据模型
│       ├── routes/        # 路由定义
│       ├── services/      # 业务逻辑
│       ├── utils/         # 工具函数
│       └── websocket/     # Socket.IO 事件处理
├── client/                # React 前端
│   └── src/
│       ├── api/           # API 请求层
│       ├── hooks/         # 自定义 Hooks
│       ├── pages/         # 页面组件
│       └── stores/        # Zustand 状态管理
├── nginx/                 # Nginx 反向代理配置
├── scripts/               # 数据初始化脚本
├── Dockerfile
├── docker-compose.example.yml
└── .gitignore
```

## 游戏模式

**9 人标准局**：3 狼人 · 预言家 · 女巫 · 猎人 · 3 村民

```
夜晚：预言家查验 → 狼人刀人 → 女巫用药
白天：公布死讯 → 依次发言 → 投票放逐 → 遗言
```

## 致谢

本项目参考了 [gy-lrs-lcoco2](https://github.com/goyoung/gy-lrs-lcoco2)（by goyoung）的狼人杀简化实现。

## 许可证

MIT
