import { Test, TestingModule } from '@nestjs/testing';
import { StudyroomController } from './studyroom.controller';

describe('StudyroomController', () => {
  let controller: StudyroomController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudyroomController],
    }).compile();

    controller = module.get<StudyroomController>(StudyroomController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
