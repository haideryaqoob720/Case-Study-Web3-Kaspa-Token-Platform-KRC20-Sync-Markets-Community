import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { CommunityDocument } from '../src/database/community.schema';
import { CommunityMemberDocument } from '../src/database/community-member.schema';
import { ConversationDocument } from '../src/database/conversation.schema';
import { MessageDocument } from '../src/database/message.schema';

describe('Community (e2e)', () => {
  let app: INestApplication<App>;
  let communityModel: Model<CommunityDocument>;
  let memberModel: Model<CommunityMemberDocument>;
  let conversationModel: Model<ConversationDocument>;
  let messageModel: Model<MessageDocument>;

  const ownerWallet = 'kaspa:community-e2e-owner-wallet';
  const memberWallet = 'kaspa:community-e2e-member-wallet';
  const outsiderWallet = 'kaspa:community-e2e-outsider-wallet';

  let ownerUserId: string;
  let memberUserId: string;
  let outsiderUserId: string;

  let communityId: string;
  let conversationIdOwner: string;
  let conversationIdMember: string;
  let messageIdOwner: string;
  let messageIdMember: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    communityModel = moduleFixture.get<Model<CommunityDocument>>(
      getModelToken(CommunityDocument.name),
    );
    memberModel = moduleFixture.get<Model<CommunityMemberDocument>>(
      getModelToken(CommunityMemberDocument.name),
    );
    conversationModel = moduleFixture.get<Model<ConversationDocument>>(
      getModelToken(ConversationDocument.name),
    );
    messageModel = moduleFixture.get<Model<MessageDocument>>(
      getModelToken(MessageDocument.name),
    );

    const ownerRes = await request(app.getHttpServer())
      .get('/api/users/by-wallet')
      .query({ walletAddress: ownerWallet })
      .expect(200);
    ownerUserId = ownerRes.body.user.id;

    const memberRes = await request(app.getHttpServer())
      .get('/api/users/by-wallet')
      .query({ walletAddress: memberWallet })
      .expect(200);
    memberUserId = memberRes.body.user.id;

    const outsiderRes = await request(app.getHttpServer())
      .get('/api/users/by-wallet')
      .query({ walletAddress: outsiderWallet })
      .expect(200);
    outsiderUserId = outsiderRes.body.user.id;
  });

  afterAll(async () => {
    if (conversationIdOwner) {
      await messageModel
        .deleteMany({ conversationId: conversationIdOwner })
        .exec();
    }
    if (communityId) {
      await conversationModel.deleteMany({ communityId }).exec();
      await memberModel.deleteMany({ communityId }).exec();
      await communityModel.deleteOne({ _id: communityId }).exec();
    }
    await app.close();
  });

  describe('Communities', () => {
    it('POST /community - ownerWallet creates a community, expect 201, owner auto-added as CommunityMember with role owner', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/community')
        .send({
          name: 'E2E Test Community',
          description: 'Description',
          walletAddress: ownerWallet,
        })
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.name).toBe('E2E Test Community');
      expect(res.body.createdByWallet).toBe(ownerWallet);
      communityId = res.body._id?.toString?.() ?? res.body.id;

      const membersRes = await request(app.getHttpServer())
        .get(`/api/community/${communityId}/members`)
        .query({ walletAddress: ownerWallet })
        .expect(200);
      const ownerMember = membersRes.body.find(
        (m: any) => m.walletAddress === ownerWallet,
      );
      expect(ownerMember).toBeDefined();
      expect(ownerMember.role).toBe('owner');
    });

    it('GET /community - fetch all, expect created community present', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/community')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find(
        (c: any) => (c._id ?? c.id) === communityId,
      );
      expect(found).toBeDefined();
      expect(found.name).toBe('E2E Test Community');
    });

    it('GET /community/:id - fetch by id, expect 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/community/${communityId}`)
        .query({ walletAddress: ownerWallet })
        .expect(200);
      expect(res.body._id?.toString?.() ?? res.body.id).toBe(communityId);
      expect(res.body.name).toBe('E2E Test Community');
    });

    it('PATCH /community/:id - memberWallet attempts update, expect 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/community/${communityId}`)
        .send({
          walletAddress: memberWallet,
          name: 'Hacked',
        })
        .expect(403);
    });

    it('PATCH /community/:id - ownerWallet updates name, expect 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/community/${communityId}`)
        .send({
          walletAddress: ownerWallet,
          name: 'E2E Test Community Updated',
        })
        .expect(200);
      expect(res.body.name).toBe('E2E Test Community Updated');
    });
  });

  describe('Members', () => {
    it('POST /community/:id/join - memberWallet joins, expect 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/community/${communityId}/join`)
        .send({ walletAddress: memberWallet })
        .expect(201);
      expect(res.body.communityId?.toString?.() ?? res.body.communityId).toBe(
        communityId,
      );
      expect(res.body.walletAddress).toBe(memberWallet);
      expect(res.body.role).toBe('member');
    });

    it('POST /community/:id/join - memberWallet joins again, expect 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/community/${communityId}/join`)
        .send({ walletAddress: memberWallet })
        .expect(400);
    });

    it('GET /community/:id/members - fetch members, expect both owner and member present', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/community/${communityId}/members`)
        .query({ walletAddress: ownerWallet })
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const wallets = res.body.map((m: any) => m.walletAddress);
      expect(wallets).toContain(ownerWallet);
      expect(wallets).toContain(memberWallet);
    });

    it('PATCH /community/:id/members - ownerWallet grants memberWallet canCreateConversations true, expect 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/community/${communityId}/members`)
        .send({
          walletAddress: ownerWallet,
          targetWallet: memberWallet,
          canCreateConversations: true,
        })
        .expect(200);
      expect(res.body.walletAddress).toBe(memberWallet);
      expect(res.body.canCreateConversations).toBe(true);
    });

    it('DELETE /community/:id/leave - outsiderWallet attempts to leave without joining, expect 404', async () => {
      await request(app.getHttpServer())
        .delete(`/api/community/${communityId}/leave`)
        .send({ walletAddress: outsiderWallet })
        .expect(404);
    });
  });

  describe('Conversations', () => {
    it('POST /community/:id/conversations - ownerWallet creates a conversation, expect 201, response includes communityId', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/community/${communityId}/conversations`)
        .send({
          name: 'Owner Conversation',
          walletAddress: ownerWallet,
        })
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.type).toBe('group');
      expect(res.body.name).toBe('Owner Conversation');
      const convCommunityId =
        res.body.communityId?.toString?.() ?? res.body.communityId;
      expect(convCommunityId).toBe(communityId);
      conversationIdOwner = res.body._id?.toString?.() ?? res.body.id;
    });

    it('POST /community/:id/conversations - memberWallet creates a conversation (permission granted), expect 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/community/${communityId}/conversations`)
        .send({
          name: 'Member Conversation',
          walletAddress: memberWallet,
        })
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.name).toBe('Member Conversation');
      conversationIdMember = res.body._id?.toString?.() ?? res.body.id;
    });

    it('POST /community/:id/conversations - outsiderWallet attempts to create, expect 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/community/${communityId}/conversations`)
        .send({
          name: 'Outsider Conversation',
          walletAddress: outsiderWallet,
        })
        .expect(403);
    });

    it('GET /community/:id/conversations - memberWallet fetches, expect both conversations returned', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/community/${communityId}/conversations`)
        .query({ walletAddress: memberWallet })
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      const ids = res.body.map((c: any) => c._id?.toString?.() ?? c.id);
      expect(ids).toContain(conversationIdOwner);
      expect(ids).toContain(conversationIdMember);
    });

    it('DELETE /community/:id/conversations/:convId - memberWallet attempts to delete, expect 403', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/community/${communityId}/conversations/${conversationIdOwner}`,
        )
        .send({ walletAddress: memberWallet })
        .expect(403);
    });

    it('DELETE /community/:id/conversations/:convId - ownerWallet deletes, expect 204', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/community/${communityId}/conversations/${conversationIdMember}`,
        )
        .send({ walletAddress: ownerWallet })
        .expect(204);
    });
  });

  describe('Messages', () => {
    it('POST /community/:id/conversations/:convId/messages - ownerWallet sends a message, expect 201, authorId matches ownerWallet', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/community/${communityId}/conversations/${conversationIdOwner}/messages`,
        )
        .send({
          text: 'Hello from owner',
          walletAddress: ownerWallet,
        })
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.text).toBe('Hello from owner');
      expect(res.body.authorId).toBe(ownerWallet);
      messageIdOwner = res.body._id?.toString?.() ?? res.body.id;
    });

    it('POST /community/:id/conversations/:convId/messages - memberWallet sends a message with tags containing ownerWallet address, expect tags in response', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/community/${communityId}/conversations/${conversationIdOwner}/messages`,
        )
        .send({
          text: 'Hello with tag',
          walletAddress: memberWallet,
          tags: [ownerWallet],
        })
        .expect(201);

      expect(res.body).toHaveProperty('_id');
      expect(res.body.text).toBe('Hello with tag');
      expect(res.body.authorId).toBe(memberWallet);
      expect(Array.isArray(res.body.tags)).toBe(true);
      expect(res.body.tags).toContain(ownerWallet);
      messageIdMember = res.body._id?.toString?.() ?? res.body.id;
    });

    it('POST /community/:id/conversations/:convId/messages - outsiderWallet attempts to send, expect 403', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/community/${communityId}/conversations/${conversationIdOwner}/messages`,
        )
        .send({
          text: 'Hello from outsider',
          walletAddress: outsiderWallet,
        })
        .expect(403);
    });

    it('GET /community/:id/conversations/:convId/messages - fetch first page, verify data and nextCursor', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/community/${communityId}/conversations/${conversationIdOwner}/messages`,
        )
        .query({ walletAddress: ownerWallet, limit: 20 })
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('nextCursor');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /community/:id/conversations/:convId/messages?cursor=x - fetch next page using cursor', async () => {
      const firstRes = await request(app.getHttpServer())
        .get(
          `/api/community/${communityId}/conversations/${conversationIdOwner}/messages`,
        )
        .query({ walletAddress: ownerWallet, limit: 1 })
        .expect(200);

      const cursor = firstRes.body.nextCursor;
      if (cursor) {
        const res = await request(app.getHttpServer())
          .get(
            `/api/community/${communityId}/conversations/${conversationIdOwner}/messages`,
          )
          .query({ walletAddress: ownerWallet, limit: 20, cursor })
          .expect(200);
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('nextCursor');
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('DELETE /community/:id/conversations/:convId/messages/:msgId - ownerWallet deletes own message, expect 204', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/community/${communityId}/conversations/${conversationIdOwner}/messages/${messageIdOwner}`,
        )
        .send({ walletAddress: ownerWallet })
        .expect(204);
    });

    it('DELETE /community/:id/conversations/:convId/messages/:msgId - ownerWallet attempts to delete memberWallet message, expect 403', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/community/${communityId}/conversations/${conversationIdOwner}/messages/${messageIdMember}`,
        )
        .send({ walletAddress: ownerWallet })
        .expect(403);
    });
  });
});
