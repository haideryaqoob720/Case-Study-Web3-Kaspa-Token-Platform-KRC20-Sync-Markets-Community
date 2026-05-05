import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConversationDocument,
  ConversationEntity,
} from '../database/conversation.schema';
import { MessageDocument, MessageEntity } from '../database/message.schema';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class ChatRepository {
  private readonly logger = new Logger(ChatRepository.name);

  constructor(
    @InjectModel(ConversationDocument.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(MessageDocument.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  async findDirectConversation(
    walletAddressA: string,
    walletAddressB: string,
  ): Promise<ConversationEntity | null> {
    const doc = await this.conversationModel
      .findOne({
        type: 'direct',
        participants: { $all: [walletAddressA.trim(), walletAddressB.trim()], $size: 2 },
      })
      .lean()
      .exec();
    return doc ? (doc as unknown as ConversationEntity) : null;
  }

  async createConversation(
    dto: CreateConversationDto & { createdBy: string },
  ): Promise<ConversationEntity> {
    const created = await this.conversationModel.create({
      type: dto.type,
      participants: dto.participants.map((addr) => addr.trim()),
      name: dto.name || null,
      createdBy: dto.createdBy.trim(),
    });
    return created.toObject
      ? created.toObject()
      : (created as unknown as ConversationEntity);
  }

  async findConversationsByUser(
    walletAddress: string,
  ): Promise<ConversationEntity[]> {
    const docs = await this.conversationModel
      .find({ participants: walletAddress.trim() })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs as unknown as ConversationEntity[];
  }

  async findConversationById(
    id: string | Types.ObjectId,
  ): Promise<ConversationEntity | null> {
    const doc = await this.conversationModel
      .findById(id)
      .lean()
      .exec();
    return doc ? (doc as unknown as ConversationEntity) : null;
  }

  async updateConversationName(
    id: string | Types.ObjectId,
    name: string,
  ): Promise<ConversationEntity | null> {
    const doc = await this.conversationModel
      .findByIdAndUpdate(id, { $set: { name } }, { new: true })
      .lean()
      .exec();
    return doc ? (doc as unknown as ConversationEntity) : null;
  }

  async removeParticipant(
    id: string | Types.ObjectId,
    walletAddress: string,
  ): Promise<ConversationEntity | null> {
    const doc = await this.conversationModel
      .findByIdAndUpdate(
        id,
        { $pull: { participants: walletAddress.trim() } },
        { new: true },
      )
      .lean()
      .exec();
    return doc ? (doc as unknown as ConversationEntity) : null;
  }

  async deleteConversation(id: string | Types.ObjectId): Promise<boolean> {
    const result = await this.conversationModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async createMessage(
    dto: CreateMessageDto & {
      conversationId: Types.ObjectId;
      authorId: string;
    },
  ): Promise<MessageEntity> {
    const created = await this.messageModel.create({
      conversationId: dto.conversationId,
      authorId: dto.authorId.trim(),
      text: dto.text,
      tags: (dto.tags || []).map((addr) => addr.trim()),
    });
    return created.toObject
      ? created.toObject()
      : (created as unknown as MessageEntity);
  }

  async findMessages(
    conversationId: Types.ObjectId,
    limit: number,
    cursor?: string,
  ): Promise<MessageEntity[]> {
    const query: any = { conversationId };
    if (cursor) {
      query._id = { $lt: new Types.ObjectId(cursor) };
    }

    const docs = await this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs as unknown as MessageEntity[];
  }

  async findMessageById(
    id: string | Types.ObjectId,
  ): Promise<MessageEntity | null> {
    const doc = await this.messageModel.findById(id).lean().exec();
    return doc ? (doc as unknown as MessageEntity) : null;
  }

  async deleteMessage(id: string | Types.ObjectId): Promise<boolean> {
    const result = await this.messageModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }
}

