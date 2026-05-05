import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ConversationDocument,
  ConversationSchema,
} from '../database/conversation.schema';
import { MessageDocument, MessageSchema } from '../database/message.schema';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRepository } from './chat.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConversationDocument.name, schema: ConversationSchema },
      { name: MessageDocument.name, schema: MessageSchema },
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService],
})
export class ChatModule {}

