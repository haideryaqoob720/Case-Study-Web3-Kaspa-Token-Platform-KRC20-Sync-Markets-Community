import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CommunityRepository } from './community.repository';
import { CommunityGateway } from './community.gateway';
import { UsersService } from '../users/users.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { PaginationDto } from './dto/pagination.dto';
import { CommunityEntity } from '../database/community.schema';
import { CommunityMemberEntity } from '../database/community-member.schema';
import { ConversationEntity } from '../database/conversation.schema';
import { MessageEntity } from '../database/message.schema';

@Injectable()
export class CommunityService {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => CommunityGateway))
    private readonly communityGateway: CommunityGateway,
  ) { }

  async createCommunity(dto: CreateCommunityDto): Promise<CommunityEntity> {
    await this.usersService.getOrCreateByWallet(dto.walletAddress);
    const wallet = dto.walletAddress.trim();
    const community = await this.communityRepository.createCommunity({
      name: dto.name,
      description: dto.description ?? null,
      createdByWallet: wallet,
    });
    await this.communityRepository.createMember({
      communityId: community._id as Types.ObjectId,
      walletAddress: wallet,
      role: 'owner',
      canCreateConversations: true,
    });
    return community;
  }

  async getCommunities(): Promise<CommunityEntity[]> {
    return this.communityRepository.findAllCommunities();
  }

  async getCommunityById(id: string): Promise<CommunityEntity> {
    const community = await this.communityRepository.findCommunityById(id);
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    return community;
  }

  async getConversationById(
    conversationId: string,
  ): Promise<ConversationEntity | null> {
    return this.communityRepository.findConversationById(conversationId);
  }

  async validateMembership(
    communityId: string,
    walletAddress: string,
  ): Promise<boolean> {
    const member = await this.communityRepository.findMember(
      new Types.ObjectId(communityId),
      walletAddress.trim(),
    );
    return !!member;
  }

  async updateCommunity(
    id: string,
    dto: UpdateCommunityDto,
  ): Promise<CommunityEntity> {
    const wallet = dto.walletAddress.trim();
    const member = await this.communityRepository.findMember(
      new Types.ObjectId(id),
      wallet,
    );
    if (!member || member.role !== 'owner') {
      throw new ForbiddenException('Only the owner can update the community');
    }
    const data: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    const updated = await this.communityRepository.updateCommunity(id, data);
    if (!updated) {
      throw new NotFoundException('Community not found');
    }
    return updated;
  }

  async deleteCommunity(id: string, walletAddress: string): Promise<void> {
    const wallet = walletAddress.trim();
    const member = await this.communityRepository.findMember(
      new Types.ObjectId(id),
      wallet,
    );
    if (!member || member.role !== 'owner') {
      throw new ForbiddenException('Only the owner can delete the community');
    }
    const members = await this.communityRepository.findMembers(
      new Types.ObjectId(id),
    );
    for (const m of members) {
      await this.communityRepository.removeMember(
        new Types.ObjectId(id),
        m.walletAddress,
      );
    }
    const conversations = await this.communityRepository.findConversationsByCommunity(
      new Types.ObjectId(id),
    );
    for (const c of conversations) {
      await this.communityRepository.deleteConversation(c._id);
    }
    await this.communityRepository.deleteCommunity(id);
  }

  async joinCommunity(
    communityId: string,
    walletAddress: string,
  ): Promise<CommunityMemberEntity> {
    const wallet = walletAddress.trim();
    const existing = await this.communityRepository.findMember(
      new Types.ObjectId(communityId),
      wallet,
    );
    if (existing) {
      throw new BadRequestException('Already a member');
    }
    await this.usersService.getOrCreateByWallet(wallet);
    return this.communityRepository.createMember({
      communityId: new Types.ObjectId(communityId),
      walletAddress: wallet,
      role: 'member',
    });
  }

  async leaveCommunity(
    communityId: string,
    walletAddress: string,
  ): Promise<void> {
    const wallet = walletAddress.trim();
    const member = await this.communityRepository.findMember(
      new Types.ObjectId(communityId),
      wallet,
    );
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === 'owner') {
      throw new BadRequestException('Owner cannot leave; transfer ownership or delete the community');
    }
    await this.communityRepository.removeMember(
      new Types.ObjectId(communityId),
      wallet,
    );
  }

  async getMembers(communityId: string): Promise<CommunityMemberEntity[]> {
    return this.communityRepository.findMembers(new Types.ObjectId(communityId));
  }

  async updateMemberPermissions(
    communityId: string,
    dto: UpdateMemberDto,
  ): Promise<CommunityMemberEntity> {
    const requesterWallet = dto.walletAddress.trim();
    const requester = await this.communityRepository.findMember(
      new Types.ObjectId(communityId),
      requesterWallet,
    );
    if (!requester) {
      throw new ForbiddenException('Not a member');
    }
    if (requester.role !== 'owner' && requester.role !== 'admin') {
      throw new ForbiddenException('Only owner or admin can update member permissions');
    }
    const data: {
      role?: 'owner' | 'admin' | 'member';
      canCreateConversations?: boolean;
    } = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.canCreateConversations !== undefined) {
      data.canCreateConversations = dto.canCreateConversations;
    }
    const updated = await this.communityRepository.updateMember(
      new Types.ObjectId(communityId),
      dto.targetWallet.trim(),
      data,
    );
    if (!updated) {
      throw new NotFoundException('Member not found');
    }
    return updated;
  }

  async createConversation(
    communityId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationEntity> {
    const wallet = dto.walletAddress.trim();
    await this.usersService.getOrCreateByWallet(wallet);
    return this.communityRepository.createConversation({
      communityId: new Types.ObjectId(communityId),
      name: dto.name || null,
      type: 'group',
      participants: [wallet],
      createdBy: wallet,
    });
  }

  async getConversations(
    communityId: string,
    walletAddress: string,
  ): Promise<ConversationEntity[]> {
    const wallet = walletAddress.trim();
    return this.communityRepository.findConversationsByCommunity(
      new Types.ObjectId(communityId),
    );
  }

  async updateConversation(
    communityId: string,
    id: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationEntity> {
    const wallet = dto.walletAddress.trim();
    const member = await this.communityRepository.findMember(
      new Types.ObjectId(communityId),
      wallet,
    );
    if (!member) {
      throw new ForbiddenException('Not a member of this community');
    }
    if (member.role !== 'owner' && member.role !== 'admin') {
      throw new ForbiddenException('Only owner or admin can update the conversation');
    }
    const updated = await this.communityRepository.updateConversation(
      id,
      dto.name,
    );
    if (!updated) {
      throw new NotFoundException('Conversation not found');
    }
    return updated;
  }

  async deleteConversation(
    communityId: string,
    id: string,
    walletAddress: string,
  ): Promise<void> {
    const wallet = walletAddress.trim();
    const member = await this.communityRepository.findMember(
      new Types.ObjectId(communityId),
      wallet,
    );
    if (!member) {
      throw new ForbiddenException('Not a member of this community');
    }
    if (member.role !== 'owner' && member.role !== 'admin') {
      throw new ForbiddenException('Only owner or admin can delete the conversation');
    }
    const deleted = await this.communityRepository.deleteConversation(id);
    if (!deleted) {
      throw new NotFoundException('Conversation not found');
    }
  }

  async createMessage(
    conversationId: string,
    dto: CreateMessageDto,
  ): Promise<MessageEntity> {
    const wallet = dto.walletAddress.trim();
    const conversation = await this.communityRepository.findConversationById(
      conversationId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (!conversation.communityId) {
      throw new BadRequestException('Conversation is not a community conversation');
    }
    await this.usersService.getOrCreateByWallet(wallet);
    const tags = (dto.tags || []).map((t) => (typeof t === 'string' ? t.trim() : t));
    const savedMessage = await this.communityRepository.createMessage({
      conversationId: new Types.ObjectId(conversationId),
      authorId: wallet,
      text: dto.text,
      tags,
    });
    this.communityGateway.emitNewMessage(conversationId, savedMessage);
    return savedMessage;
  }

  async getMessages(
    conversationId: string,
    paginationDto: PaginationDto,
  ): Promise<{ data: MessageEntity[]; nextCursor: string | null }> {
    const wallet = paginationDto.walletAddress.trim();
    const conversation = await this.communityRepository.findConversationById(
      conversationId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (!conversation.communityId) {
      throw new BadRequestException('Conversation is not a community conversation');
    }
    const limit = Math.min(paginationDto.limit ?? 20, 50);
    const messages = await this.communityRepository.findMessages(
      new Types.ObjectId(conversationId),
      limit + 1,
      paginationDto.cursor,
    );
    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor =
      hasMore && data.length > 0
        ? (data[data.length - 1]._id as Types.ObjectId).toString()
        : null;
    return { data, nextCursor };
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    walletAddress: string,
  ): Promise<void> {
    const wallet = walletAddress.trim();
    const conversation = await this.communityRepository.findConversationById(
      conversationId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (!conversation.communityId) {
      throw new BadRequestException('Conversation is not a community conversation');
    }
    const message = await this.communityRepository.findMessageById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (message.authorId !== wallet) {
      throw new ForbiddenException('User is not the message author');
    }
    await this.communityRepository.deleteMessage(messageId);
  }
}
