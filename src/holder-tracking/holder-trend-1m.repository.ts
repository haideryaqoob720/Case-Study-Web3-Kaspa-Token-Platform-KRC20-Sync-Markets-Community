import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HolderTrend1mSnapshotDocument } from '../database/schemas/holder-trend-1m-snapshot.schema';

type HolderTrendPoint = {
  bucketStart: Date;
  holders: number;
  top10: number;
  top20: number;
  top50: number;
  top10Delta: number;
  top20Delta: number;
  top50Delta: number;
};

@Injectable()
export class HolderTrend1mRepository {
  private readonly aggregatedCollectionName = 'aggregated_holder_trend_snapshots';
  private readonly interval = '1d_1m';

  constructor(
    @InjectModel(HolderTrend1mSnapshotDocument.name)
    private readonly model: Model<HolderTrend1mSnapshotDocument>,
  ) {}

  /** Latest minute bucket timestamp for a token, or null if none. */
  async getLatestPointTimestamp(ticker: string): Promise<Date | null> {
    const token = ticker.toUpperCase();
    const doc = await this.model.db.collection(this.aggregatedCollectionName).findOne(
      { tokenIdentifier: token, interval: this.interval },
      { projection: { _id: 0, points: 1 } },
    );
    const points = Array.isArray(doc?.points) ? doc.points : [];
    let maxMs = 0;
    for (const p of points) {
      const t = p?.timestamp ?? p?.date;
      if (!t) continue;
      const ms = new Date(t).getTime();
      if (ms > maxMs) maxMs = ms;
    }
    return maxMs > 0 ? new Date(maxMs) : null;
  }

  async findPreviousPoint(
    ticker: string,
    bucketStart: Date,
  ): Promise<HolderTrendPoint | null> {
    const token = ticker.toUpperCase();
    const doc = await this.model.db
      .collection(this.aggregatedCollectionName)
      .findOne(
        {
          tokenIdentifier: token,
          interval: this.interval,
        },
        { projection: { _id: 0, points: 1 } },
      );

    const points = Array.isArray(doc?.points) ? doc.points : [];
    const point = points
      .filter(
        (p: any) =>
          (p?.timestamp || p?.date) &&
          new Date(p.timestamp ?? p.date).getTime() < bucketStart.getTime(),
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.timestamp ?? b.date).getTime() -
          new Date(a.timestamp ?? a.date).getTime(),
      )[0];
    if (!point) return null;
    return {
      bucketStart: new Date(point.timestamp ?? point.date),
      holders: Number(point.holders ?? 0),
      top10: Number(point.top10 ?? 0),
      top20: Number(point.top20 ?? 0),
      top50: Number(point.top50 ?? 0),
      top10Delta: Number(point.top10Delta ?? 0),
      top20Delta: Number(point.top20Delta ?? 0),
      top50Delta: Number(point.top50Delta ?? 0),
    };
  }

  async upsertPoint(
    ticker: string,
    point: HolderTrendPoint,
  ): Promise<void> {
    const token = ticker.toUpperCase();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const firstUpdate: any = {
      $setOnInsert: {
        tokenIdentifier: token,
        interval: this.interval,
        createdAt: now,
      },
      $set: {
        updatedAt: now,
      },
      // same bucket run repeats should replace point, not duplicate it
      $pull: {
        points: {
          timestamp: point.bucketStart,
        },
      },
    };

    await this.model.db.collection(this.aggregatedCollectionName).updateOne(
      { tokenIdentifier: token, interval: this.interval },
      firstUpdate,
      { upsert: true },
    );

    const secondUpdate: any = {
      $push: {
        points: {
          $each: [
            {
              timestamp: point.bucketStart,
              holders: point.holders,
              top10: point.top10,
              top20: point.top20,
              top50: point.top50,
              top10Delta: point.top10Delta,
              top20Delta: point.top20Delta,
              top50Delta: point.top50Delta,
            },
          ],
          $slice: -1440,
        },
      },
      $set: {
        updatedAt: now,
      },
    };

    await this.model.db.collection(this.aggregatedCollectionName).updateOne(
      { tokenIdentifier: token, interval: this.interval },
      secondUpdate,
    );

    const thirdUpdate: any = {
      $pull: {
        points: {
          timestamp: { $lt: dayAgo },
        },
      },
      $set: {
        updatedAt: now,
      },
    };

    await this.model.db.collection(this.aggregatedCollectionName).updateOne(
      { tokenIdentifier: token, interval: this.interval },
      thirdUpdate,
    );
  }

  async findLast24h(ticker: string): Promise<HolderTrendPoint[]> {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const token = ticker.toUpperCase();
    const doc = await this.model.db.collection(this.aggregatedCollectionName).findOne(
      {
        tokenIdentifier: token,
        interval: this.interval,
      },
      {
        projection: { _id: 0, points: 1 },
      },
    );
    const points = Array.isArray(doc?.points) ? doc.points : [];
    return points
      .filter((p: any) => (p?.timestamp || p?.date) && new Date(p.timestamp ?? p.date) >= from)
      .sort(
        (a: any, b: any) =>
          new Date(a.timestamp ?? a.date).getTime() -
          new Date(b.timestamp ?? b.date).getTime(),
      )
      .map((p: any) => ({
        bucketStart: new Date(p.timestamp ?? p.date),
        holders: Number(p.holders ?? 0),
        top10: Number(p.top10 ?? 0),
        top20: Number(p.top20 ?? 0),
        top50: Number(p.top50 ?? 0),
        top10Delta: Number(p.top10Delta ?? 0),
        top20Delta: Number(p.top20Delta ?? 0),
        top50Delta: Number(p.top50Delta ?? 0),
      }));
  }
}

