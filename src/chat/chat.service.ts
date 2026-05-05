import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ChatRepository } from './chat.repository';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { PaginationDto } from './dto/pagination.dto';
import {
  ConversationEntity,
} from '../database/conversation.schema';
import { MessageEntity } from '../database/message.schema';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly chatRepository: ChatRepository) {}

  async createConversation(
    walletAddress: string | null | undefined,
    dto: CreateConversationDto,
  ): Promise<ConversationEntity> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }

    const trimmedWallet = walletAddress.trim();
    const trimmedParticipants = dto.participants.map((addr) => addr.trim());

    if (dto.type === 'direct') {
      if (trimmedParticipants.length !== 2) {
        throw new BadRequestException(
          'Direct conversation must have exactly 2 participants',
        );
      }

      if (!trimmedParticipants.includes(trimmedWallet)) {
        throw new BadRequestException('User must be one of the participants');
      }

      const existing = await this.chatRepository.findDirectConversation(
        trimmedParticipants[0],
        trimmedParticipants[1],
      );
      if (existing) {
        return existing;
      }
    } else {
      if (!dto.name || !dto.name.trim()) {
        throw new BadRequestException('Group conversation name is required');
      }

      if (trimmedParticipants.length < 2) {
        throw new BadRequestException(
          'Group conversation must have at least 2 participants',
        );
      }

      if (!trimmedParticipants.includes(trimmedWallet)) {
        throw new BadRequestException('User must be one of the participants');
      }
    }

    return this.chatRepository.createConversation({
      ...dto,
      createdBy: trimmedWallet,
    });
  }

  async getConversations(walletAddress: string | null | undefined): Promise<ConversationEntity[]> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }
    return this.chatRepository.findConversationsByUser(walletAddress.trim());
  }

  async getConversationById(
    id: string,
    walletAddress: string | null | undefined,
  ): Promise<ConversationEntity> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }

    const conversation = await this.chatRepository.findConversationById(id);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const trimmedWallet = walletAddress.trim();
    const isParticipant = conversation.participants.includes(trimmedWallet);
    if (!isParticipant) {
      throw new ForbiddenException('User is not a participant');
    }

    return conversation;
  }

  async updateConversation(
    id: string,
    walletAddress: string | null | undefined,
    name: string,
  ): Promise<ConversationEntity> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }

    const conversation = await this.chatRepository.findConversationById(id);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const trimmedWallet = walletAddress.trim();
    const isParticipant = conversation.participants.includes(trimmedWallet);
    if (!isParticipant) {
      throw new ForbiddenException('User is not a participant');
    }

    if (conversation.type === 'direct') {
      throw new BadRequestException('Cannot update name of direct conversation');
    }

    const updated = await this.chatRepository.updateConversationName(id, name);
    if (!updated) {
      throw new NotFoundException('Conversation not found');
    }

    return updated;
  }

  async deleteConversation(id: string, walletAddress: string | null | undefined): Promise<void> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }

    const conversation = await this.chatRepository.findConversationById(id);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const trimmedWallet = walletAddress.trim();
    const isParticipant = conversation.participants.includes(trimmedWallet);
    if (!isParticipant) {
      throw new ForbiddenException('User is not a participant');
    }

    const updated = await this.chatRepository.removeParticipant(
      id,
      trimmedWallet,
    );
    if (!updated) {
      throw new NotFoundException('Conversation not found');
    }

    if (updated.participants.length === 0) {
      await this.chatRepository.deleteConversation(id);
    }
  }

  async createMessage(
    conversationId: string,
    walletAddress: string | null | undefined,
    dto: CreateMessageDto,
  ): Promise<MessageEntity> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }

    const conversation = await this.chatRepository.findConversationById(
      conversationId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const trimmedWallet = walletAddress.trim();
    const isParticipant = conversation.participants.includes(trimmedWallet);
    if (!isParticipant) {
      throw new ForbiddenException('User is not a participant');
    }

    return this.chatRepository.createMessage({
      ...dto,
      conversationId: new Types.ObjectId(conversationId),
      authorId: trimmedWallet,
    });
  }

  async getMessages(
    conversationId: string,
    walletAddress: string | null | undefined,
    paginationDto: PaginationDto,
  ): Promise<{ data: MessageEntity[]; nextCursor: string | null }> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }

    const conversation = await this.chatRepository.findConversationById(
      conversationId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const trimmedWallet = walletAddress.trim();
    const isParticipant = conversation.participants.includes(trimmedWallet);
    if (!isParticipant) {
      throw new ForbiddenException('User is not a participant');
    }

    const limit = paginationDto.limit || 20;
    const messages = await this.chatRepository.findMessages(
      new Types.ObjectId(conversationId),
      limit + 1,
      paginationDto.cursor,
    );

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore && data.length > 0
      ? (data[data.length - 1]._id as Types.ObjectId).toString()
      : null;

    return { data, nextCursor };
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    walletAddress: string | null | undefined,
  ): Promise<void> {
    if (!walletAddress || typeof walletAddress !== 'string' || !walletAddress.trim()) {
      throw new BadRequestException('walletAddress is required');
    }

    const conversation = await this.chatRepository.findConversationById(
      conversationId,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const trimmedWallet = walletAddress.trim();
    const isParticipant = conversation.participants.includes(trimmedWallet);
    if (!isParticipant) {
      throw new ForbiddenException('User is not a participant');
    }

    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.authorId !== trimmedWallet) {
      throw new ForbiddenException('User is not the message author');
    }

    await this.chatRepository.deleteMessage(messageId);
  }
}

