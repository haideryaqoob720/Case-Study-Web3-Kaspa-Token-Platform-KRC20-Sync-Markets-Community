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
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CommunityService } from './community.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { JoinCommunityDto } from './dto/join-community.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { PaginationDto } from './dto/pagination.dto';

@ApiTags('community')
@ApiBearerAuth()
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a community' })
  @ApiResponse({ status: 201, description: 'Community created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createCommunity(@Body() dto: CreateCommunityDto) {
    return this.communityService.createCommunity(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all communities' })
  @ApiResponse({ status: 200, description: 'List of communities' })
  async getCommunities() {
    return this.communityService.getCommunities();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get community by ID' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Wallet address',
  })
  @ApiResponse({ status: 200, description: 'Community details' })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async getCommunityById(
    @Param('id') id: string,
    @Query('walletAddress') _walletAddress: string,
  ) {
    return this.communityService.getCommunityById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update community (owner only)' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Community updated' })
  @ApiResponse({ status: 403, description: 'Only owner can update' })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async updateCommunity(@Param('id') id: string, @Body() dto: UpdateCommunityDto) {
    return this.communityService.updateCommunity(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete community (owner only)' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiResponse({ status: 204, description: 'Community deleted' })
  @ApiResponse({ status: 403, description: 'Only owner can delete' })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async deleteCommunity(@Param('id') id: string, @Body() dto: JoinCommunityDto) {
    await this.communityService.deleteCommunity(id, dto.walletAddress);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join a community' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiResponse({ status: 201, description: 'Joined community' })
  @ApiResponse({ status: 400, description: 'Already a member' })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async joinCommunity(@Param('id') id: string, @Body() dto: JoinCommunityDto) {
    return this.communityService.joinCommunity(id, dto.walletAddress);
  }

  @Delete(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave a community' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiResponse({ status: 204, description: 'Left community' })
  @ApiResponse({ status: 400, description: 'Owner cannot leave' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async leaveCommunity(@Param('id') id: string, @Body() dto: JoinCommunityDto) {
    await this.communityService.leaveCommunity(id, dto.walletAddress);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get community members' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Wallet address',
  })
  @ApiResponse({ status: 200, description: 'List of members' })
  @ApiResponse({ status: 403, description: 'Not a member' })
  async getMembers(
    @Param('id') id: string,
    @Query('walletAddress') _walletAddress: string,
  ) {
    return this.communityService.getMembers(id);
  }

  @Patch(':id/members')
  @ApiOperation({ summary: 'Update member permissions (owner/admin only)' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Member updated' })
  @ApiResponse({ status: 403, description: 'Not owner or admin' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async updateMemberPermissions(
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.communityService.updateMemberPermissions(id, dto);
  }

  @Post(':id/conversations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a conversation in the community' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiResponse({ status: 201, description: 'Conversation created' })
  @ApiResponse({ status: 404, description: 'Community not found' })
  async createConversation(
    @Param('id') id: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.communityService.createConversation(id, dto);
  }

  @Get(':id/conversations')
  @ApiOperation({ summary: 'Get community conversations' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiQuery({
    name: 'walletAddress',
    required: true,
    type: String,
    description: 'Wallet address',
  })
  @ApiResponse({ status: 200, description: 'List of conversations' })
  async getConversations(
    @Param('id') id: string,
    @Query('walletAddress') walletAddress: string,
  ) {
    return this.communityService.getConversations(id, walletAddress);
  }

  @Patch(':id/conversations/:convId')
  @ApiOperation({ summary: 'Update conversation (owner/admin only)' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiParam({ name: 'convId', description: 'Conversation MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Conversation updated' })
  @ApiResponse({ status: 403, description: 'Only owner or admin can update' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async updateConversation(
    @Param('id') id: string,
    @Param('convId') convId: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.communityService.updateConversation(id, convId, dto);
  }

  @Delete(':id/conversations/:convId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete conversation (owner/admin only)' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiParam({ name: 'convId', description: 'Conversation MongoDB ObjectId' })
  @ApiResponse({ status: 204, description: 'Conversation deleted' })
  @ApiResponse({ status: 403, description: 'Only owner or admin can delete' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async deleteConversation(
    @Param('id') id: string,
    @Param('convId') convId: string,
    @Body() dto: JoinCommunityDto,
  ) {
    await this.communityService.deleteConversation(id, convId, dto.walletAddress);
  }

  @Post(':id/conversations/:convId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a message in a community conversation' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiParam({ name: 'convId', description: 'Conversation MongoDB ObjectId' })
  @ApiResponse({ status: 201, description: 'Message created' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async createMessage(
    @Param('convId') convId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.communityService.createMessage(convId, dto);
  }

  @Get(':id/conversations/:convId/messages')
  @ApiOperation({ summary: 'Get messages in a community conversation (paginated)' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiParam({ name: 'convId', description: 'Conversation MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Paginated messages' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getMessages(
    @Param('convId') convId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.communityService.getMessages(convId, paginationDto);
  }

  @Delete(':id/conversations/:convId/messages/:msgId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a message (author only)' })
  @ApiParam({ name: 'id', description: 'Community MongoDB ObjectId' })
  @ApiParam({ name: 'convId', description: 'Conversation MongoDB ObjectId' })
  @ApiParam({ name: 'msgId', description: 'Message MongoDB ObjectId' })
  @ApiResponse({ status: 204, description: 'Message deleted' })
  @ApiResponse({ status: 403, description: 'Not the message author' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(
    @Param('convId') convId: string,
    @Param('msgId') msgId: string,
    @Body() dto: DeleteMessageDto,
  ) {
    await this.communityService.deleteMessage(
      convId,
      msgId,
      dto.walletAddress,
    );
  }
}
