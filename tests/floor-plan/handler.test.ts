// Mock DB
const mockGet = jest.fn();
const mockAll = jest.fn();
const mockRun = jest.fn();
jest.mock('../../src/db/connection.js', () => ({
  getDb: () => ({
    prepare: () => ({
      get: mockGet,
      all: mockAll,
      run: mockRun,
    }),
  }),
}));

// Mock floor plan service
const mockGenerateFloorPlan = jest.fn();
jest.mock('../../src/services/floor-plan.js', () => ({
  generateFloorPlan: mockGenerateFloorPlan,
}));

import { handleFloorPlanRequest, generateFloorPlanIfNeeded, isFloorPlanRequest } from '../../src/handlers/floor-plan.js';

describe('isFloorPlanRequest', () => {
  it('matches "floor plan"', () => {
    expect(isFloorPlanRequest('floor plan')).toBe(true);
  });

  it('matches "Floor Plan" (case insensitive)', () => {
    expect(isFloorPlanRequest('Floor Plan')).toBe(true);
  });

  it('matches "show floor plan"', () => {
    expect(isFloorPlanRequest('show floor plan')).toBe(true);
  });

  it('matches "floorplan" (no space)', () => {
    expect(isFloorPlanRequest('floorplan')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(isFloorPlanRequest('hello world')).toBe(false);
    expect(isFloorPlanRequest('the floor is clean')).toBe(false);
  });
});

describe('handleFloorPlanRequest', () => {
  const mockCtx: any = {
    reply: jest.fn(),
    replyWithDocument: jest.fn(),
  };

  const mockGroup = {
    id: 1,
    chat_id: 123,
    property_id: 10,
    owner_id: 1,
    cleaner_id: 2,
    group_type: 'cleaning' as const,
    is_active: true,
    created_at: '2026-01-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends SVG document when floor plan exists', async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    mockGet.mockReturnValue({ id: 10, name: 'Beach House', floor_plan_svg: svgContent });

    const result = await handleFloorPlanRequest(mockCtx, mockGroup);

    expect(result).toBe(true);
    expect(mockCtx.replyWithDocument).toHaveBeenCalledWith(
      {
        source: Buffer.from(svgContent, 'utf-8'),
        filename: 'Beach House-floor-plan.svg',
      },
      { caption: 'Floor plan for Beach House' }
    );
  });

  it('replies "no floor plan" when property has no floor plan', async () => {
    mockGet.mockReturnValue({ id: 10, name: 'Beach House', floor_plan_svg: null });

    const result = await handleFloorPlanRequest(mockCtx, mockGroup);

    expect(result).toBe(true);
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('No floor plan available yet')
    );
    expect(mockCtx.replyWithDocument).not.toHaveBeenCalled();
  });

  it('replies "no floor plan" when property not found', async () => {
    mockGet.mockReturnValue(undefined);

    const result = await handleFloorPlanRequest(mockCtx, mockGroup);

    expect(result).toBe(true);
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('No floor plan available yet')
    );
  });
});

describe('generateFloorPlanIfNeeded', () => {
  const mockBot: any = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips generation when floor plan already exists', async () => {
    mockGet.mockReturnValue({ id: 10, floor_plan_svg: '<svg/>' });

    await generateFloorPlanIfNeeded(mockBot, 10, 'file123');

    expect(mockGenerateFloorPlan).not.toHaveBeenCalled();
  });

  it('calls generateFloorPlan when no floor plan exists', async () => {
    mockGet.mockReturnValue({ id: 10, floor_plan_svg: null });
    mockAll.mockReturnValue([{ name: 'Kitchen' }, { name: 'Bedroom' }]);
    mockGenerateFloorPlan.mockResolvedValue('<svg/>');

    await generateFloorPlanIfNeeded(mockBot, 10, 'file123');

    expect(mockGenerateFloorPlan).toHaveBeenCalledWith(
      mockBot, 10, 'file123', ['Kitchen', 'Bedroom']
    );
  });

  it('skips generation when no rooms exist', async () => {
    mockGet.mockReturnValue({ id: 10, floor_plan_svg: null });
    mockAll.mockReturnValue([]);

    await generateFloorPlanIfNeeded(mockBot, 10, 'file123');

    expect(mockGenerateFloorPlan).not.toHaveBeenCalled();
  });

  it('catches errors silently (fire-and-forget safe)', async () => {
    mockGet.mockReturnValue({ id: 10, floor_plan_svg: null });
    mockAll.mockReturnValue([{ name: 'Kitchen' }]);
    mockGenerateFloorPlan.mockRejectedValue(new Error('API down'));

    // Should NOT throw
    await expect(generateFloorPlanIfNeeded(mockBot, 10, 'file123')).resolves.toBeUndefined();
  });

  it('skips when property not found', async () => {
    mockGet.mockReturnValue(undefined);

    await generateFloorPlanIfNeeded(mockBot, 10, 'file123');

    expect(mockGenerateFloorPlan).not.toHaveBeenCalled();
  });
});
