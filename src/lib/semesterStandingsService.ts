import { apiFetch } from './api';

export interface SemesterStandingRecord {
  _id: string;
  term: string;
  academicYear: string;
  season: string;
  cumulativeGpa: number;
  standing: 'Probation' | 'Good Standing';
  revision: number;
  finalizedAt: string;
  previousVersions?: Array<{
    cumulativeGpa: number;
    standing: 'Probation' | 'Good Standing';
    revision: number;
    finalizedAt: string;
    finalizedBy: string;
  }>;
}

export interface SemesterStandingsResponse {
  history: SemesterStandingRecord[];
  summary: {
    consecutiveProbationSemesters: number;
    isProbation: boolean;
    standing: string | null;
  };
}

export const fetchSemesterStandings = (studentId: string) =>
  apiFetch<SemesterStandingsResponse>(`/api/semester-standings/${studentId}`);

export const finalizeSemesterStanding = (
  studentId: string,
  termId: string,
  cumulativeGpa: number,
  expectedRevision: number
) =>
  apiFetch<{ standing: SemesterStandingRecord; message: string }>(
    `/api/semester-standings/${studentId}/${termId}/finalize`,
    {
      method: 'POST',
      body: JSON.stringify({ cumulativeGpa, expectedRevision }),
    }
  );
