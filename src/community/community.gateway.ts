import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Server } from 'socket.io';
import { Socket } from 'socket.io';
import { CommunityService } from './community.service';

@WebSocketGateway({
  namespace: 'community',
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  },
})
@Injectable()
export class CommunityGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => CommunityService))
    private readonly communityService: CommunityService,
  ) { }

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @MessageBody()
    payload: { conversationId: string; walletAddress: string },
    @ConnectedSocket() socket: Socket,
  ): Promise<void> {
    const { conversationId, walletAddress } = payload || {};
    if (!conversationId || !walletAddress) {
      socket.emit('error', 'conversationId and walletAddress are required');
      return;
    }
    try {
      const conversation =
        await this.communityService.getConversationById(conversationId);
      if (!conversation) {
        socket.emit('error', 'Conversation not found');
        return;
      }
      if (!conversation.communityId) {
        socket.emit('error', 'Conversation is not a community conversation');
        return;
      }
      const communityId = conversation.communityId.toString();
      socket.join(conversationId);
    } catch {
      socket.emit('error', 'Failed to join conversation');
    }
  }

  @SubscribeMessage('leave-conversation')
  handleLeaveConversation(
    @MessageBody() payload: { conversationId: string },
    @ConnectedSocket() socket: Socket,
  ): void {
    const conversationId = payload?.conversationId;
    if (conversationId) {
      socket.leave(conversationId);
    }
  }

  emitNewMessage(conversationId: string, message: any): void {
    this.server.to(conversationId).emit('new-message', message);
  }
}
