import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FeedbackDocument,
  FeedbackEntity,
  FeedbackType,
} from '../database/schemas/feedback.schema';

export interface FindAllFeedbackOptions {
  page?: number;
  limit?: number;
  type?: FeedbackType;
}

export interface FindAllFeedbackResult {
  data: FeedbackEntity[];
  total: number;
}

@Injectable()
export class FeedbackRepository {
  constructor(
    @InjectModel(FeedbackDocument.name)
    private readonly model: Model<FeedbackDocument>,
  ) {}

  async create(entity: Partial<FeedbackEntity>): Promise<FeedbackEntity> {
    const created = new this.model(entity);
    await created.save();
    return created as FeedbackEntity;
  }

  async findAll(
    options: FindAllFeedbackOptions,
  ): Promise<FindAllFeedbackResult> {
    const { page = 1, limit = 20, type } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (type) {
      filter.type = type;
    }

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter),
    ]);

    return {
      data: data as unknown as FeedbackEntity[],
      total,
    };
  }
}
