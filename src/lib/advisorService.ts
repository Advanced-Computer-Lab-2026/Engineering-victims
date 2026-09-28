import { apiFetch } from './api';

export interface Advisor {
  _id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  assignedStudentsCount: number;
  createdAt: string;
}

export interface AdvisorDetails {
  advisor: {
    _id: string;
    fullName: string;
    email: string;
    isActive: boolean;
    createdAt: string;
  };
  assignedStudents: {
    count: number;
    students: Array<{
      _id: string;
      fullName: string;
      studentId: string;
      email: string;
      major: string;
      currentSemester: number;
      academicStanding: string;
      workflowStatus: string;
    }>;
  };
}

export interface AddAdvisorResponse {
  message: string;
  advisor: {
    fullName: string;
    email: string;
    role: string;
  };
}

export interface RemoveAdvisorResponse {
  message: string;
  previousRole: string;
  advisor: {
    fullName: string;
    email: string;
    currentRole: string;
  };
  note: string;
}

/**
 * FR 11.0: Add an advisor using their GUC email
 */
export const addAdvisor = async (email: string): Promise<AddAdvisorResponse> => {
  return apiFetch<AddAdvisorResponse>('/api/advisors/add', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

/**
 * FR 12.0: Remove an advisor from the advising system
 */
export const removeAdvisor = async (email: string): Promise<RemoveAdvisorResponse> => {
  return apiFetch<RemoveAdvisorResponse>('/api/advisors/remove', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

/**
 * Get list of all advisors
 */
export const listAdvisors = async (): Promise<{ count: number; advisors: Advisor[] }> => {
  return apiFetch<{ count: number; advisors: Advisor[] }>('/api/advisors', {
    method: 'GET',
  });
};

/**
 * Get single advisor details with assigned students
 */
export const getAdvisor = async (email: string): Promise<AdvisorDetails> => {
  return apiFetch<AdvisorDetails>(`/api/advisors/${email}`, {
    method: 'GET',
  });
};
