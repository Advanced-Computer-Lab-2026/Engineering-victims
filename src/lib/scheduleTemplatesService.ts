import { apiFetch } from './api';
import type { CourseSlot, ScheduleSlotOption, ScheduleTemplate, TemplatePublicationStatus } from './types';

type ApiRecord = Record<string, any>;

const idOf = (value: ApiRecord | string): string => {
  if (typeof value === 'string') return value;
  return String(value?.id ?? value?._id ?? '');
};

const normalizeSlot = (slot: ApiRecord): CourseSlot => ({
  id: idOf(slot),
  offeringId: idOf(slot.offeringId),
  instructorId: idOf(slot.instructorId),
  slotType: slot.slotType,
  groupNumber: Number(slot.groupNumber),
  dayOfWeek: slot.dayOfWeek,
  startTime: slot.startTime,
  endTime: slot.endTime,
  roomId: slot.roomId,
  maxCapacity: Number(slot.maxCapacity),
  assignedCount: Number(slot.assignedCount ?? 0),
});

const normalizeTemplate = (template: ApiRecord): ScheduleTemplate => ({
  id: idOf(template),
  major: String(template.major),
  semester: Number(template.semester),
  studyGroup: String(template.studyGroup),
  termId: idOf(template.termId),
  publicationStatus: template.publicationStatus ?? 'Published',
  slots: (template.slots ?? []).filter((slot: unknown) => typeof slot === 'object' && slot !== null).map(normalizeSlot),
});

export const fetchScheduleTemplates = async (termId: string): Promise<ScheduleTemplate[]> => {
  const response = await apiFetch<{ templates: ApiRecord[] }>(`/api/templates?termId=${encodeURIComponent(termId)}`);
  return response.templates.map(normalizeTemplate);
};

export const fetchScheduleSlotOptions = async (
  termId: string,
  major: string,
  semester: number
): Promise<ScheduleSlotOption[]> => {
  const { offerings } = await apiFetch<{ offerings: ApiRecord[] }>(
    `/api/offerings?termId=${encodeURIComponent(termId)}`
  );
  const eligibleOfferings = offerings.filter((offering) =>
    offering.publicationStatus === 'Published'
    && (!offering.eligibleMajors?.length || offering.eligibleMajors.includes(major))
    && (!offering.eligibleSemesters?.length || offering.eligibleSemesters.includes(String(semester)))
  );

  const details = await Promise.all(eligibleOfferings.map((offering) =>
    apiFetch<{ slots: ApiRecord[] }>(`/api/offerings/${idOf(offering)}`)
      .then(({ slots }) => slots.map((slot) => ({
        ...normalizeSlot(slot),
        courseCode: offering.courseId?.code ?? 'Course',
        courseName: offering.courseId?.name ?? 'Unknown course',
      })))
  ));

  return details.flat();
};

export interface ScheduleTemplateDraft {
  major: string;
  semester: number;
  studyGroup: string;
  termId: string;
  slots: string[];
}

export const createScheduleTemplate = async (draft: ScheduleTemplateDraft) => {
  const response = await apiFetch<{ template: ApiRecord }>('/api/templates', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
  return (await fetchScheduleTemplates(draft.termId)).find((template) => template.id === idOf(response.template))
    ?? normalizeTemplate({ ...response.template, slots: [] });
};

export const updateScheduleTemplate = async (id: string, draft: ScheduleTemplateDraft) => {
  const response = await apiFetch<{ template: ApiRecord }>(`/api/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(draft),
  });
  return (await fetchScheduleTemplates(draft.termId)).find((template) => template.id === id)
    ?? normalizeTemplate({ ...response.template, slots: [] });
};

export const setScheduleTemplatePublication = async (
  id: string,
  publicationStatus: TemplatePublicationStatus
) => {
  const response = await apiFetch<{ template: ApiRecord }>(`/api/templates/${id}/publish`, {
    method: 'PATCH',
    body: JSON.stringify({ publicationStatus }),
  });
  return normalizeTemplate(response.template);
};

export const assignStudentToScheduleGroup = async (studentId: string, studyGroup: string, termId: string) => {
  return apiFetch<{ message: string; slotsCount: number }>(`/api/students/${studentId}/group`, {
    method: 'PATCH',
    body: JSON.stringify({ studyGroup, termId }),
  });
};