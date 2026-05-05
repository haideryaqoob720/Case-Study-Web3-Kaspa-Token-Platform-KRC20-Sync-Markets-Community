import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunityDocument, CommunitySchema } from '../database/community.schema';
import {
  CommunityMemberDocument,
  CommunityMemberSchema,
} from '../database/community-member.schema';
import {
  ConversationDocument,
  ConversationSchema,
} from '../database/conversation.schema';
import { MessageDocument, MessageSchema } from '../database/message.schema';
import { CommunityController } from './community.controller';
import { CommunityGateway } from './community.gateway';
import { CommunityRepository } from './community.repository';
import { CommunityService } from './community.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommunityDocument.name, schema: CommunitySchema },
      { name: CommunityMemberDocument.name, schema: CommunityMemberSchema },
      { name: ConversationDocument.name, schema: ConversationSchema },
      { name: MessageDocument.name, schema: MessageSchema },
    ]),
    UsersModule,
  ],
  controllers: [CommunityController],
  providers: [CommunityRepository, CommunityService, CommunityGateway],
  exports: [CommunityService],
})
export class CommunityModule {}
