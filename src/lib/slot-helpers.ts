import type { Slot } from './types';
import { minToHHmm } from './types';

export function slotFromDoc(id: string, data: Record<string, any>): Slot {
  return {
    slotId: id,
    type: data.type,
    date: data.date,
    session: data.session ?? '',
    startMin: data.startMin,
    endMin: data.endMin,
    capacity: data.capacity,
    remaining: data.remaining ?? data.capacity,
    location: data.location ?? '',
    display: data.display ?? `${data.type} | ${data.date} | ${minToHHmm(data.startMin)}–${minToHHmm(data.endMin)}`,
  };
}
