# Database Setup Guide

## Prerequisites

- Node.js and npm installed

## Quick Start

### 1. Environment Variables

Create a `.env` file in the root directory:

```env
# Application
NODE_ENV=development
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=kaspamemes
DB_SYNCHRONIZE=false
DB_LOGGING=true

# Database Connection Pool (Production Optimized)
DB_MAX_CONNECTIONS=20
DB_CONNECTION_TIMEOUT=30000
DB_IDLE_TIMEOUT=10000
```

### 2. Run the Application

```bash
npm run start:dev
```

## Production Considerations

1. **Never use `DB_SYNCHRONIZE=true` in production** - Use migrations instead
2. **Change default passwords** - Update `DB_PASSWORD` in production
3. **Use SSL connections** - Already configured for production
4. **Connection pooling** - Configured with optimal settings
5. **Environment-specific configs** - Use `.env.production` for production

## Creating Entities

Create entities in `src/database/entities/` directory:

```typescript
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;
}
```

## Using Database in Services

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './database/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private usersRepository: Repository<UserEntity>,
  ) {}

  async findAll(): Promise<UserEntity[]> {
    return this.usersRepository.find();
  }
}
```
