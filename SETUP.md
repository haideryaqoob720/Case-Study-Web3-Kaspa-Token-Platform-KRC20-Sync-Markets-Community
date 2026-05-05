# PostgreSQL Database Setup - Complete Guide

## ✅ What's Been Set Up

### 1. **Database Configuration**

- `src/config/database.config.ts` - Database configuration with environment variables
- `src/config/config.module.ts` - Global configuration module
- Connection pooling optimized for production
- SSL support for production environments

### 2. **Database Module**

- `src/database/database.module.ts` - Main database module
- `src/database/database.health.ts` - Health check service
- `src/database/entities/example.entity.ts` - Example entity template

### 3. **Application Enhancements**

- Global validation pipes
- CORS enabled
- API prefix (`/api`)
- Health check endpoint

## 🚀 Quick Start

### Step 1: Create Environment File

Create `.env` file in root directory:

```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=kaspamemes
DB_SYNCHRONIZE=false
DB_LOGGING=true

DB_MAX_CONNECTIONS=20
DB_CONNECTION_TIMEOUT=30000
DB_IDLE_TIMEOUT=10000
```

### Step 2: Start Application

```bash
yarn start:dev
```

### Step 4: Verify Connection

Visit: `http://localhost:3000/api/health`

You should see:

```json
{
  "status": "ok",
  "timestamp": "...",
  "database": {
    "isConnected": true,
    "database": "kaspamemes",
    "host": "localhost",
    "port": 5432,
    "healthy": true
  }
}
```

## 📋 Available Commands

```bash
# Database Commands
yarn db:up      # Start PostgreSQL
yarn db:down    # Stop PostgreSQL
yarn db:logs    # View database logs
yarn db:reset   # Reset database (removes all data)

# Application Commands
yarn start:dev  # Start in development mode
yarn build      # Build for production
yarn start:prod # Start in production mode
```

## 🏗️ Project Structure

```
src/
├── config/
│   ├── config.module.ts       # Global config module
│   └── database.config.ts      # Database configuration
├── database/
│   ├── database.module.ts      # Database module
│   ├── database.health.ts      # Health check service
│   ├── entities/               # TypeORM entities
│   │   └── example.entity.ts
│   └── README.md               # Database usage guide
├── app.module.ts               # Main app module (updated)
├── app.controller.ts           # Main controller (with health check)
├── app.service.ts
└── main.ts                     # Entry point (enhanced)

.env                            # Environment variables (create this)
```

## 🔧 Production Checklist

- [x] Environment-based configuration
- [x] Connection pooling
- [x] SSL support for production
- [x] Health check endpoint
- [x] Global validation pipes
- [x] CORS configuration
- [x] Error handling
- [x] TypeORM integration
- [x] Example entity structure

## ⚠️ Important Notes

1. **Never use `DB_SYNCHRONIZE=true` in production** - Use migrations instead
2. **Change default passwords** before deploying
3. **Use `.env.production`** for production environment
4. **Health checks** run every 10 seconds automatically

## 📚 Next Steps

1. Create your entities in `src/database/entities/`
2. Create feature modules (e.g., `users`, `products`)
3. Use TypeORM repositories in your services
4. Set up migrations for production
5. Configure proper CORS origins for production

## 🆘 Troubleshooting

### Database not connecting?

```bash
# Check logs
yarn db:logs

# Restart database
yarn db:reset
```
