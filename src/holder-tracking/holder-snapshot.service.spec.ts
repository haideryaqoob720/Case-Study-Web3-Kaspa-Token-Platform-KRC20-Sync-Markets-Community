import { Test, TestingModule } from '@nestjs/testing';
import { HolderSnapshotService } from './holder-snapshot.service';
import { HolderSnapshotRepository } from './holder-snapshot.repository';

describe('HolderSnapshotService', () => {
  let service: HolderSnapshotService;
  let repository: jest.Mocked<HolderSnapshotRepository>;

  beforeEach(async () => {
    const mockRepository = {
      upsert: jest.fn(),
      bulkUpsert: jest.fn(),
      findByTickerAndDate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolderSnapshotService,
        {
          provide: HolderSnapshotRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<HolderSnapshotService>(HolderSnapshotService);
    repository = module.get(HolderSnapshotRepository);
  });

  it('should calculate top 10 percentage correctly', () => {
    const holders = [
      { address: 'addr1', amount: '1000000000000000' },
      { address: 'addr2', amount: '500000000000000' },
      { address: 'addr3', amount: '300000000000000' },
    ];
    const totalSupply = BigInt('2000000000000000');

    const result = (service as any).calculatePercentages(holders, totalSupply);
    // Top 10 = sum of first 10 holder balances (here all 3): 90% of supply
    expect(result.top10).toBe(90);
  });

  it('should calculate top 50 percentage correctly', () => {
    const holders = Array.from({ length: 50 }, (_, i) => ({
      address: `addr${i}`,
      amount: '100000000000000',
    }));
    const totalSupply = BigInt('10000000000000000');

    const result = (service as any).calculatePercentages(holders, totalSupply);
    expect(result.top50).toBe(50);
  });

  it('should handle zero total supply', () => {
    const holders = [{ address: 'addr1', amount: '1000000000000000' }];
    const totalSupply = BigInt('0');

    const result = (service as any).calculatePercentages(holders, totalSupply);
    expect(result.top10).toBe(0);
    expect(result.top20).toBe(0);
    expect(result.top50).toBe(0);
  });

  it('should handle empty holders array', () => {
    const holders: any[] = [];
    const totalSupply = BigInt('1000000000000000');

    const result = (service as any).calculatePercentages(holders, totalSupply);
    expect(result.top10).toBe(0);
    expect(result.top20).toBe(0);
    expect(result.top50).toBe(0);
  });

  it('should save daily snapshot (delegates to saveDailySnapshots → bulkUpsert)', async () => {
    const snapshotData = {
      ticker: 'NACHO',
      holderTotal: 1000,
      transferTotal: 5000,
      mintTotal: 100,
      topHolders: [
        { address: 'addr1', amount: '1000000000000000' },
        { address: 'addr2', amount: '500000000000000' },
      ],
      mintedSupply: '2000000000000000',
    };

    repository.bulkUpsert.mockResolvedValue(undefined);

    await service.saveDailySnapshot(snapshotData);

    expect(repository.bulkUpsert).toHaveBeenCalledTimes(1);
    const snapshots = repository.bulkUpsert.mock.calls[0][0];
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].ticker).toBe('NACHO');
    expect(snapshots[0].holderTotal).toBe(1000);
    expect(snapshots[0]).not.toHaveProperty('topHolders');
    // Both holders in top 10: (1e15 + 5e14) / 2e15 = 75%
    expect(snapshots[0].top10Percentage).toBe(75);
  });
});


