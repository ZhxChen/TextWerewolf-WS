import 'dotenv/config'

const required = (name, value) => {
  if (!value) {
    console.error(`[CONFIG ERROR] 环境变量 ${name} 未设置，请在 .env 文件中配置`)
    process.exit(1)
  }
  return value
}

// CORS_ORIGIN 支持格式：
//   *                          -- 开发环境，允许所有来源
//   https://example.com        -- 单个域名
//   a.com,b.com                -- 多个域名，逗号分隔
const parseCorsOrigins = (value) => {
  if (!value || value === '*') return '*'
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

const config = {
  port: process.env.PORT || 6100,
  serveStatic: process.env.SERVE_STATIC !== 'false',
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGIN || '*')
  },
  mongodb: {
    uri: required('MONGODB_URI', process.env.MONGODB_URI)
  },
  jwt: {
    secret: required('JWT_SECRET', process.env.JWT_SECRET),
    expiresIn: '24h'
  },
  crypto: {
    secret: required('CRYPTO_SECRET', process.env.CRYPTO_SECRET)
  }
}

export default config
