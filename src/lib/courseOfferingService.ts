import { apiFetch } from './api';
import { CourseOffering, CourseSlot } from './types';

export const courseOfferingService = {
  async getOfferingsByTerm(termId: string): Promise<{ offerings: CourseOffering[] }> {
    return apiFetch<{ offerings: CourseOffering[] }>(`/api/offerings?termId=${termId}`);
  },

  async getOfferingDetails(id: string): Promise<{ offering: CourseOffering; slots: CourseSlot[] }> {
    return apiFetch<{ offering: CourseOffering; slots: CourseSlot[] }>(`/api/offerings/${id}`);
  },

  async createOffering(data: any): Promise<{ message: string; offering: CourseOffering }> {
    return apiFetch<{ message: string; offering: CourseOffering }>('/api/offerings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateOffering(id: string, data: Partial<CourseOffering>): Promise<{ message: string; offering: CourseOffering }> {
    return apiFetch<{ message: string; offering: CourseOffering }>(`/api/offerings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async togglePublishStatus(id: string): Promise<{ message: string; offering: CourseOffering }> {
    return apiFetch<{ message: string; offering: CourseOffering }>(`/api/offerings/${id}/publish`, {
      method: 'PATCH',
    });
  },

  async deleteOffering(id: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/api/offerings/${id}`, { method: 'DELETE' });
  },

  async updateSlot(id: string, data: Partial<CourseSlot>): Promise<{ message: string; slot: CourseSlot }> {
    // The server mounts this under /api/offerings/slots/:id; calling /api/slots
    // never matched a route, so every slot edit 404'd.
    return apiFetch<{ message: string; slot: CourseSlot }>(`/api/offerings/slots/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteSlot(id: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/api/offerings/slots/${id}`, { method: 'DELETE' });
  },
};
