import { envelope, escapeRegex } from '../../common/pagination.js';
import { AppError } from '../../middleware/errorHandler.js';
import { AircraftModel } from './aircraft.model.js';

export async function listAircraft(q: { page: number; limit: number; search?: string; status?: string }) {
  const filter: Record<string, unknown> = {};
  if (q.search) filter.registration = { $regex: escapeRegex(q.search), $options: 'i' };
  if (q.status) filter.status = q.status;
  const [data, total] = await Promise.all([
    AircraftModel.find(filter)
      .sort({ registration: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    AircraftModel.countDocuments(filter),
  ]);
  return envelope(data, q.page, q.limit, total);
}

export async function getAircraft(id: string) {
  const aircraft = await AircraftModel.findById(id);
  if (!aircraft) throw new AppError(404, 'NOT_FOUND', 'Aircraft not found');
  return aircraft;
}