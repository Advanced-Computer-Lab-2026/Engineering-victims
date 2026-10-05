import { apiFetch, apiUrl, authHeaders, ApiError } from './api';
import type { AcademicHistoryResponse, MandatoryCandidatesResponse, TranscriptResponse } from './types';

/** Req 54, Advising Student: their own history, resolved from the token. */
export const fetchMyAcademicHistory = async (): Promise<AcademicHistoryResponse> =>
  apiFetch<AcademicHistoryResponse>('/api/academic-history/me');

/** Req 54, Advisor / Coordinator: any Advising Student by directory id. */
export const fetchStudentAcademicHistory = async (studentId: string): Promise<AcademicHistoryResponse> =>
  apiFetch<AcademicHistoryResponse>(`/api/academic-history/${encodeURIComponent(studentId)}`);

const yearQuery = (year?: string): string => (year ? `?year=${encodeURIComponent(year)}` : '');

/** Req 55, Advising Student: their own transcript. Without a year, the newest attended one. */
export const fetchMyTranscript = async (year?: string): Promise<TranscriptResponse> =>
  apiFetch<TranscriptResponse>(`/api/academic-history/me/transcript${yearQuery(year)}`);

/** Req 55, Advisor / Coordinator: any Advising Student's transcript. */
export const fetchStudentTranscript = async (studentId: string, year?: string): Promise<TranscriptResponse> =>
  apiFetch<TranscriptResponse>(
    `/api/academic-history/${encodeURIComponent(studentId)}/transcript${yearQuery(year)}`
  );

/** Req 61, Advisor / Coordinator: failed and unattended courses as mandatory-course candidates. */
export const fetchMandatoryCandidates = async (studentId: string): Promise<MandatoryCandidatesResponse> =>
  apiFetch<MandatoryCandidatesResponse>(`/api/academic-history/${encodeURIComponent(studentId)}/mandatory-candidates`);

/**
 * Req 56: downloads the academic history as a PDF and saves it as `fileName`.
 *
 * apiFetch parses JSON, so the file is fetched directly, with the same token
 * and the same ApiError messages. Without a studentId it is the signed-in
 * Advising Student's own record.
 */
export const downloadAcademicHistoryPdf = async (fileName: string, studentId?: string): Promise<void> => {
  const path = studentId
    ? `/api/academic-history/${encodeURIComponent(studentId)}/pdf`
    : '/api/academic-history/me/pdf';

  let response: Response;
  try {
    response = await fetch(apiUrl(path), { headers: authHeaders() });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(payload.message || `Request failed with status ${response.status}`, response.status);
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick so the browser has started the download first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
