import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Search, ExternalLink } from 'lucide-react';
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

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    try {
      setLoading(true);
      // The queue specifically filters for students awaiting coordinator approval
      const response = await fetchStudents({
        ...EMPTY_FILTERS,
        workflowStatus: 'Pending Approval',
        search: searchTerm
      }, 1, 100);
      setStudents(response.students);
    } catch (err: any) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  };

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
        <div className="text-sm text-slate-400">
          Showing <span className="text-white font-medium">{students.length}</span> students requiring attention
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <p>Loading approval queue...</p>
        </div>
      ) : error ? (
        <Card className="p-6 text-center text-rose-400">
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
              <thead className="bg-slate-900/50 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-400">Student</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-400">ID / Major</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider text-slate-400">Current Status</th>
                  <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-800/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{student.fullName}</div>
                      <div className="text-xs text-slate-500">{student.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-300">{student.studentId}</div>
                      <div className="text-xs text-slate-500">{student.major}</div>
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
