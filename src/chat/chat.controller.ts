import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { DeleteConversationDto } from './dto/delete-conversation.dto';
import { DeleteMessageDto } from './dto/delete-message.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new conversation',
    description: 'Create a direct or group conversation. For direct conversations, returns existing if one already exists.',
  })
  @ApiResponse({
    status: 201,
    description: 'Conversation created or existing conversation returned',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid participants, missing group name, or user not in participants',
  })
  async createConversation(@Body() dto: CreateConversationDto) {
    return this.chatService.createConversation(dto.walletAddress, dto);
  }

  @Get('conversations')
  @ApiOperation({
    summary: 'Get all conversations for user',
    description: 'Returns all conversations where the user is a participant',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Connected wallet address',
  })
  @ApiResponse({
    status: 200,
    description: 'List of conversations',
  })
  @ApiResponse({
    status: 400,
    description: 'walletAddress required',
  })
  async getConversations(@Query('walletAddress') walletAddress: string) {
    return this.chatService.getConversations(walletAddress);
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary: 'Get conversation by ID',
    description: 'Returns a single conversation if user is a participant',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation MongoDB ObjectId',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Connected wallet address',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation details',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant',
  })
  @ApiResponse({
    status: 400,
    description: 'walletAddress required',
  })
  async getConversationById(
    @Param('id') id: string,
    @Query('walletAddress') walletAddress: string,
  ) {
    return this.chatService.getConversationById(id, walletAddress);
  }

  @Patch('conversations/:id')
  @ApiOperation({
    summary: 'Update conversation name',
    description: 'Update the name of a group conversation. Cannot update direct conversations.',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation MongoDB ObjectId',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation updated',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot update direct conversation name',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant',
  })
  async updateConversation(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.chatService.updateConversation(id, dto.walletAddress, dto.name);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete conversation',
    description: 'Remove user from conversation. If no participants remain, the conversation is deleted.',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation MongoDB ObjectId',
  })
  @ApiResponse({
    status: 204,
    description: 'User removed from conversation',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant',
  })
  async deleteConversation(
    @Param('id') id: string,
    @Body() dto: DeleteConversationDto,
  ) {
    await this.chatService.deleteConversation(id, dto.walletAddress);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new message',
    description: 'Create a message in a conversation. User must be a participant.',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation MongoDB ObjectId',
  })
  @ApiResponse({
    status: 201,
    description: 'Message created',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant',
  })
  async createMessage(
    @Param('id') conversationId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.chatService.createMessage(conversationId, dto.walletAddress, dto);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({
    summary: 'Get messages in conversation',
    description: 'Get paginated messages from a conversation. User must be a participant.',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation MongoDB ObjectId',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of messages (default: 20, max: 50)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor for pagination (last message _id)',
  })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Connected wallet address',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated messages with nextCursor',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation not found',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant',
  })
  @ApiResponse({
    status: 400,
    description: 'walletAddress required',
  })
  async getMessages(
    @Param('id') conversationId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.chatService.getMessages(conversationId, paginationDto.walletAddress, paginationDto);
  }

  @Delete('conversations/:id/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a message',
    description: 'Delete a message. Only the message author can delete their own messages.',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation MongoDB ObjectId',
  })
  @ApiParam({
    name: 'messageId',
    description: 'Message MongoDB ObjectId',
  })
  @ApiResponse({
    status: 204,
    description: 'Message deleted',
  })
  @ApiResponse({
    status: 404,
    description: 'Conversation or message not found',
  })
  @ApiResponse({
    status: 403,
    description: 'User is not a participant or not the message author',
  })
  async deleteMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: DeleteMessageDto,
  ) {
    await this.chatService.deleteMessage(conversationId, messageId, dto.walletAddress);
  }
}
