import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class DatabaseHealthService {
  constructor(
    @InjectConnection()
    private connection: Connection,
  ) {}

  async isHealthy(): Promise<boolean> {
    try {
      const state = this.connection.readyState;
      if (state === 1) {
        const db = this.connection.db;
        if (db) await db.admin().ping();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getConnectionInfo() {
    const state = this.connection.readyState;
    const stateNames = [
      'disconnected',
      'connected',
      'connecting',
      'disconnecting',
    ];
    return {
      isConnected: state === 1,
      readyState: stateNames[state] ?? state,
      database: this.connection.db?.databaseName ?? 'unknown',
      host: this.connection.host ?? 'unknown',
    };
  }
}
