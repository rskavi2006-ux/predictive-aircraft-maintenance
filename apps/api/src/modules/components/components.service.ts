import { envelope } from '../../common/pagination.js';
import { AppError } from '../../middleware/errorHandler.js';
import { ComponentModel } from './component.model.js';

export async function listByAircraft(aircraftId: string) {
  return ComponentModel.find({ aircraftId }).sort({ ataChapter: 1, name: 1 });
}

export async function listComponents(q: {
  page: number;
  limit: number;
  aircraftId?: string;
  ataChapter?: number;
  kind?: string;
  status?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (q.aircraftId) filter.aircraftId = q.aircraftId;
  if (q.ataChapter) filter.ataChapter = q.ataChapter;
  if (q.kind) filter.kind = q.kind;
  if (q.status) filter.status = q.status;
  const [data, total] = await Promise.all([
    ComponentModel.find(filter)
      .sort({ ataChapter: 1, name: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    ComponentModel.countDocuments(filter),
  ]);
  return envelope(data, q.page, q.limit, total);
}

export async function getComponent(id: string) {
  const component = await ComponentModel.findById(id);
  if (!component) throw new AppError(404, 'NOT_FOUND', 'Component not found');
  return component;
}