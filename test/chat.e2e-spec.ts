import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  ConversationDocument,
} from '../src/database/conversation.schema';
import { MessageDocument } from '../src/database/message.schema';

describe('Chat (e2e)', () => {
  let app: INestApplication<App>;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;
  const user1Wallet = 'kaspa:test-user-1-wallet-address';
  const user2Wallet = 'kaspa:test-user-2-wallet-address';
  const user3Wallet = 'kaspa:test-user-3-wallet-address';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    conversationModel = moduleFixture.get<Model<ConversationDocument>>(
      getModelToken(ConversationDocument.name),
    );
    messageModel = moduleFixture.get<Model<MessageDocument>>(
      getModelToken(MessageDocument.name),
    );

    // Create test users
    const user1Response = await request(app.getHttpServer())
      .get('/api/users/by-wallet')
      .query({ walletAddress: user1Wallet })
      .expect(200);

    const user2Response = await request(app.getHttpServer())
      .get('/api/users/by-wallet')
      .query({ walletAddress: user2Wallet })
      .expect(200);

    const user3Response = await request(app.getHttpServer())
      .get('/api/users/by-wallet')
      .query({ walletAddress: user3Wallet })
      .expect(200);

    user1Id = user1Response.body.user.id;
    user2Id = user2Response.body.user.id;
    user3Id = user3Response.body.user.id;
  });

  afterAll(async () => {
    // Clean up all created conversations and messages
    await messageModel.deleteMany({}).exec();
    await conversationModel.deleteMany({}).exec();
    await app.close();
  });

  describe('Conversations', () => {
    let directConversationId: string;
    let groupConversationId: string;

    it('POST /chat/conversations - create a direct conversation between user1 and user2', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/chat/conversations')
        .set('x-user-id', user1Id)
        .send({
          type: 'direct',
          participants: [user1Id, user2Id],
        })
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.type).toBe('direct');
      expect(response.body.participants).toHaveLength(2);
      // Participants are ObjectIds, check if they contain user1Id and user2Id
      const participantIds = response.body.participants.map((p: any) =>
        p.toString ? p.toString() : p._id?.toString() || p,
      );
      expect(participantIds).toContain(user1Id);
      expect(participantIds).toContain(user2Id);
      directConversationId = response.body._id || response.body.id;
    });

    it('POST /chat/conversations - attempt to create the same direct conversation again, expect existing one returned', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/chat/conversations')
        .set('x-user-id', user1Id)
        .send({
          type: 'direct',
          participants: [user1Id, user2Id],
        })
        .expect(201);

      expect(response.body._id || response.body.id).toBe(directConversationId);
    });

    it('POST /chat/conversations - create a group conversation with a name and both users as participants', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/chat/conversations')
        .set('x-user-id', user1Id)
        .send({
          type: 'group',
          participants: [user1Id, user2Id],
          name: 'Test Group Chat',
        })
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.type).toBe('group');
      expect(response.body.name).toBe('Test Group Chat');
      expect(response.body.participants).toHaveLength(2);
      groupConversationId = response.body._id || response.body.id;
    });

    it('POST /chat/conversations - attempt to create a group conversation without a name, expect 400', async () => {
      await request(app.getHttpServer())
        .post('/api/chat/conversations')
        .set('x-user-id', user1Id)
        .send({
          type: 'group',
          participants: [user1Id, user2Id],
        })
        .expect(400);
    });

    it('GET /chat/conversations - user1 fetches their conversations, expect both conversations to appear', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/chat/conversations')
        .set('x-user-id', user1Id)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      const conversationIds = response.body.map(
        (c: any) => c._id || c.id,
      );
      expect(conversationIds).toContain(directConversationId);
      expect(conversationIds).toContain(groupConversationId);
    });

    it('GET /chat/conversations/:id - user1 fetches the direct conversation by id, expect 200', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/chat/conversations/${directConversationId}`)
        .set('x-user-id', user1Id)
        .expect(200);

      expect(response.body._id || response.body.id).toBe(directConversationId);
      expect(response.body.type).toBe('direct');
    });

    it('GET /chat/conversations/:id - a non-participant user attempts access, expect 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/chat/conversations/${directConversationId}`)
        .set('x-user-id', user3Id)
        .expect(403);
    });
  });

  describe('Messages', () => {
    let directConversationId: string;
    let message1Id: string;
    let message2Id: string;
    let nextCursor: string | null = null;

    beforeAll(async () => {
      // Get or create direct conversation for message tests
      const conversationResponse = await request(app.getHttpServer())
        .post('/api/chat/conversations')
        .set('x-user-id', user1Id)
        .send({
          type: 'direct',
          participants: [user1Id, user2Id],
        })
        .expect(201);

      directConversationId =
        conversationResponse.body._id || conversationResponse.body.id;
    });

    it('POST /chat/conversations/:id/messages - user1 sends a message in the direct conversation', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/chat/conversations/${directConversationId}/messages`)
        .set('x-user-id', user1Id)
        .send({
          text: 'Hello from user1!',
        })
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.text).toBe('Hello from user1!');
      // conversationId might be ObjectId object, convert to string for comparison
      const convId =
        response.body.conversationId?.toString?.() ||
        response.body.conversationId?._id?.toString() ||
        response.body.conversationId;
      expect(convId).toBe(directConversationId);
      message1Id = response.body._id || response.body.id;
    });

    it('POST /chat/conversations/:id/messages - user2 sends a message with a tag referencing user1', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/chat/conversations/${directConversationId}/messages`)
        .set('x-user-id', user2Id)
        .send({
          text: 'Hello user1!',
          tags: [user1Id],
        })
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.text).toBe('Hello user1!');
      expect(response.body.tags).toHaveLength(1);
      message2Id = response.body._id || response.body.id;
    });

    it('GET /chat/conversations/:id/messages - fetch first page, expect both messages and pagination fields', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/chat/conversations/${directConversationId}/messages`)
        .set('x-user-id', user1Id)
        .query({ limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('nextCursor');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);

      const messageIds = response.body.data.map((m: any) => m._id || m.id);
      expect(messageIds).toContain(message1Id);
      expect(messageIds).toContain(message2Id);

      nextCursor = response.body.nextCursor;
    });

    it('GET /chat/conversations/:id/messages?cursor=x - fetch next page using cursor from previous response', async () => {
      if (!nextCursor) {
        // If there's no cursor, create more messages to test pagination
        await request(app.getHttpServer())
          .post(`/api/chat/conversations/${directConversationId}/messages`)
          .set('x-user-id', user1Id)
          .send({ text: 'Message 3' })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/chat/conversations/${directConversationId}/messages`)
          .set('x-user-id', user2Id)
          .send({ text: 'Message 4' })
          .expect(201);

        const firstPage = await request(app.getHttpServer())
          .get(`/api/chat/conversations/${directConversationId}/messages`)
          .set('x-user-id', user1Id)
          .query({ limit: 2 })
          .expect(200);

        nextCursor = firstPage.body.nextCursor;
      }

      if (nextCursor) {
        const response = await request(app.getHttpServer())
          .get(`/api/chat/conversations/${directConversationId}/messages`)
          .set('x-user-id', user1Id)
          .query({ limit: 20, cursor: nextCursor })
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('nextCursor');
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    it('DELETE /chat/conversations/:id/messages/:messageId - user1 deletes their own message, expect 204', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/chat/conversations/${directConversationId}/messages/${message1Id}`,
        )
        .set('x-user-id', user1Id)
        .expect(204);
    });

    it('DELETE /chat/conversations/:id/messages/:messageId - user1 attempts to delete user2 message, expect 403', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/chat/conversations/${directConversationId}/messages/${message2Id}`,
        )
        .set('x-user-id', user1Id)
        .expect(403);
    });
  });
});

