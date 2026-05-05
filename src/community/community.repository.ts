import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CommunityDocument,
  CommunityEntity,
} from '../database/community.schema';
import {
  CommunityMemberDocument,
  CommunityMemberEntity,
} from '../database/community-member.schema';
import {
  ConversationDocument,
  ConversationEntity,
} from '../database/conversation.schema';
import { MessageDocument, MessageEntity } from '../database/message.schema';

@Injectable()
export class CommunityRepository {
  constructor(
    @InjectModel(CommunityDocument.name)
    private readonly communityModel: Model<CommunityDocument>,
    @InjectModel(CommunityMemberDocument.name)
    private readonly memberModel: Model<CommunityMemberDocument>,
    @InjectModel(ConversationDocument.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(MessageDocument.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  async createCommunity(data: {
    name: string;
    description?: string | null;
    createdByWallet: string;
  }): Promise<CommunityEntity> {
    const created = await this.communityModel.create(data);
    return created.toObject
      ? created.toObject()
      : (created as unknown as CommunityEntity);
  }

  async findCommunityById(
    id: string | Types.ObjectId,
  ): Promise<CommunityEntity | null> {
    const doc = await this.communityModel.findById(id).lean().exec();
    return doc ? (doc as unknown as CommunityEntity) : null;
  }

  async findAllCommunities(): Promise<CommunityEntity[]> {
    const docs = await this.communityModel.find().lean().exec();
    return docs as unknown as CommunityEntity[];
  }

  async updateCommunity(
    id: string | Types.ObjectId,
    data: { name?: string; description?: string | null },
  ): Promise<CommunityEntity | null> {
    const doc = await this.communityModel
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc ? (doc as unknown as CommunityEntity) : null;
  }

  async deleteCommunity(id: string | Types.ObjectId): Promise<boolean> {
    const result = await this.communityModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async createMember(data: {
    communityId: Types.ObjectId;
    walletAddress: string;
    role?: 'owner' | 'admin' | 'member';
    canCreateConversations?: boolean;
  }): Promise<CommunityMemberEntity> {
    const created = await this.memberModel.create(data);
    return created.toObject
      ? created.toObject()
      : (created as unknown as CommunityMemberEntity);
  }

  async findMember(
    communityId: Types.ObjectId,
    walletAddress: string,
  ): Promise<CommunityMemberEntity | null> {
    const doc = await this.memberModel
      .findOne({
        communityId: new Types.ObjectId(communityId),
        walletAddress: walletAddress.trim(),
      })
      .lean()
      .exec();
    return doc ? (doc as unknown as CommunityMemberEntity) : null;
  }

  async findMembers(
    communityId: Types.ObjectId,
  ): Promise<CommunityMemberEntity[]> {
    const docs = await this.memberModel
      .find({ communityId: new Types.ObjectId(communityId) })
      .lean()
      .exec();
    return docs as unknown as CommunityMemberEntity[];
  }

  async updateMember(
    communityId: Types.ObjectId,
    walletAddress: string,
    data: { role?: 'owner' | 'admin' | 'member'; canCreateConversations?: boolean },
  ): Promise<CommunityMemberEntity | null> {
    const doc = await this.memberModel
      .findOneAndUpdate(
        {
          communityId: new Types.ObjectId(communityId),
          walletAddress: walletAddress.trim(),
        },
        { $set: data },
        { new: true },
      )
      .lean()
      .exec();
    return doc ? (doc as unknown as CommunityMemberEntity) : null;
  }

  async removeMember(
    communityId: Types.ObjectId,
    walletAddress: string,
  ): Promise<boolean> {
    const result = await this.memberModel
      .deleteOne({
        communityId: new Types.ObjectId(communityId),
        walletAddress: walletAddress.trim(),
      })
      .exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async createConversation(data: {
    communityId: Types.ObjectId;
    name: string | null;
    type: 'group';
    participants: string[];
    createdBy: string;
  }): Promise<ConversationEntity> {
    const created = await this.conversationModel.create(data);
    return created.toObject
      ? created.toObject()
      : (created as unknown as ConversationEntity);
  }

  async findConversationById(
    id: string | Types.ObjectId,
  ): Promise<ConversationEntity | null> {
    const doc = await this.conversationModel.findById(id).lean().exec();
    return doc ? (doc as unknown as ConversationEntity) : null;
  }

  async findConversationsByCommunity(
    communityId: Types.ObjectId,
  ): Promise<ConversationEntity[]> {
    const docs = await this.conversationModel
      .find({ communityId: new Types.ObjectId(communityId) })
      .lean()
      .exec();
    return docs as unknown as ConversationEntity[];
  }

  async updateConversation(
    id: string | Types.ObjectId,
    name: string,
  ): Promise<ConversationEntity | null> {
    const doc = await this.conversationModel
      .findByIdAndUpdate(id, { $set: { name } }, { new: true })
      .lean()
      .exec();
    return doc ? (doc as unknown as ConversationEntity) : null;
  }

  async deleteConversation(id: string | Types.ObjectId): Promise<boolean> {
    const result = await this.conversationModel.deleteOne({ _id: id }).exec();
    return (result.deletedCount ?? 0) > 0;
  }

  async createMessage(data: {
    conversationId: Types.ObjectId;
    authorId: string;
    text: string;
    tags?: string[];
  }): Promise<MessageEntity> {
    const created = await this.messageModel.create({
      conversationId: data.conversationId,
      authorId: data.authorId.trim(),
      text: data.text,
      tags: (data.tags || []).map((t) => (typeof t === 'string' ? t.trim() : t)),
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
    const query: Record<string, unknown> = {
      conversationId: new Types.ObjectId(conversationId),
    };
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
