import { Test, TestingModule } from '@nestjs/testing';
import { StudyroomService } from './studyroom.service';

describe('StudyroomService', () => {
  let service: StudyroomService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudyroomService],
    }).compile();

    service = module.get<StudyroomService>(StudyroomService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
