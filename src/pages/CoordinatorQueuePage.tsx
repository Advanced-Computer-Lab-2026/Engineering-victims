import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Search, ExternalLink, LayoutDashboard } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import CustomInput from '../components/ui/CustomInput';
import CustomButton from '../components/ui/CustomButton';
import type { ApiError } from '../lib/api';
import { fetchStudents } from '../lib/studentsService';
import { EMPTY_FILTERS, type StudentSummary } from '../lib/types';

export default function CoordinatorQueuePage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadQueue = async () => {
    try {
      setLoading(true);
      setError(null);

      // We fetch students with the 'Pending Approval' status.
      // We use a large limit to ensure the queue is complete.
      const response = await fetchStudents({
        ...EMPTY_FILTERS,
        workflowStatus: 'Pending Approval',
        search: searchTerm
      }, 1, 100);

      if (response && response.students) {
        setStudents(response.students);
      } else {
        setStudents([]);
      }
    } catch (err: unknown) {
      console.error('Queue fetch error:', err);
      setError((err as ApiError).message || 'Failed to load the approval queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadQueue();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Queue"
        description="Students awaiting coordinator decision on their scheduling workflow"
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => navigate('/coordinator/pending-work')}
            icon={<LayoutDashboard className="h-4 w-4" aria-hidden />}
          >
            Pending-Work Dashboard
          </CustomButton>
        }
      />

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="w-full md:w-96">
          <CustomInput
            label="Search approval queue"
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="text-body text-on-surface-variant">
          Showing <span className="text-on-surface font-medium">{students.length}</span> students requiring attention
        </div>
      </div>

      {loading ? (
        <div role="status" className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <p>Loading approval queue...</p>
        </div>
      ) : error ? (
        <Card className="p-6 text-center text-error">
          <AlertCircle className="w-12 h-12 mx-auto mb-2" />
          <p>{error}</p>
        </Card>
      ) : students.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="w-12 h-12" />}
          title="Queue is empty"
          description="There are currently no students awaiting coordinator approval."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="px-6 py-4 text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Student</th>
                  <th className="px-6 py-4 text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">ID / Major</th>
                  <th className="px-6 py-4 text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Current Status</th>
                  <th className="px-6 py-4 text-right text-caption font-medium uppercase tracking-eyebrow text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-surface-container transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-on-surface">{student.fullName}</div>
                      <div className="text-caption text-on-surface-variant">{student.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-body text-on-surface">{student.studentId}</div>
                      <div className="text-caption text-on-surface-variant">{student.major}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone="amber">
                        {student.workflowStatus}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <CustomButton
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/students?id=${student.id}`)}
                        icon={<ExternalLink className="w-3.5 h-3.5" />}
                      >
                        Review
                      </CustomButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
