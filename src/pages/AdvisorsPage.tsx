import { useState, useEffect } from 'react';
import { UserPlus, UserMinus, Mail, AlertCircle, RotateCcw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import CustomInput from '../components/ui/CustomInput';
import CustomButton from '../components/ui/CustomButton';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import AlertBanner from '../components/ui/AlertBanner';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { addAdvisor, removeAdvisor, listAdvisors, type Advisor } from '../lib/advisorService';

export default function AdvisorsPage() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState('');
  const [removeEmail, setRemoveEmail] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  useEffect(() => {
    fetchAdvisors();
  }, []);

  const fetchAdvisors = async () => {
    try {
      setLoading(true);
      const response = await listAdvisors();

      setAdvisors(response.advisors);
    } catch (error: any) {
      console.error('Error fetching advisors:', error);
      setErrorMessage(error.message || 'Failed to load advisors');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdvisor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!addEmail.trim()) {
      setErrorMessage('Please enter an email address');
      return;
    }

    try {
      setAddLoading(true);
      const response = await addAdvisor(addEmail.trim());
      setSuccessMessage(`${response.message}: ${response.advisor.fullName}`);
      setAddEmail('');
      fetchAdvisors(); // Refresh list
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to add advisor');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveAdvisor = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!removeEmail.trim()) {
      setErrorMessage('Please enter an email address');
      return;
    }

    // Ask first; the in-app dialog replaces the browser's confirm prompt.
    setPendingRemoval(removeEmail.trim());
  };

  const performRemoveAdvisor = async () => {
    if (!pendingRemoval) return;
    try {
      setRemoveLoading(true);
      const response = await removeAdvisor(pendingRemoval);
      setSuccessMessage(`${response.message}`);
      setRemoveEmail('');
      setPendingRemoval(null);
      fetchAdvisors(); // Refresh list
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to remove advisor');
      setPendingRemoval(null);
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Advisor Management"
        description="Add or remove advisors from the advising system"
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={fetchAdvisors}
            isLoading={loading}
            icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          >
            Refresh
          </CustomButton>
        }
      />

      <div className="space-y-6">
        {/* Alert Messages */}
        {successMessage && (
          <AlertBanner tone="success" onDismiss={() => setSuccessMessage('')}>
            {successMessage}
          </AlertBanner>
        )}
        {errorMessage && (
          <AlertBanner tone="error" onDismiss={() => setErrorMessage('')}>
            {errorMessage}
          </AlertBanner>
        )}

        {/* Add/Remove Forms Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Add Advisor Form */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <UserPlus className="w-5 h-5 text-success" />
              <h3 className="text-h3 font-semibold">Add Advisor</h3>
            </div>
            <form onSubmit={handleAddAdvisor} className="space-y-4">
              <CustomInput
                label="Advisor GUC email"
                type="email"
                placeholder="name@guc.edu.eg"
                hint="Enter a valid GUC email address (@guc.edu.eg)"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                disabled={addLoading}
                icon={<Mail className="w-4 h-4" />}
              />
              <CustomButton
                type="submit"
                variant="primary"
                disabled={addLoading}
                className="w-full"
              >
                {addLoading ? 'Adding...' : 'Add Advisor'}
              </CustomButton>
            </form>
          </Card>

          {/* Remove Advisor Form */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <UserMinus className="w-5 h-5 text-error" />
              <h3 className="text-h3 font-semibold">Remove Advisor</h3>
            </div>
            <form onSubmit={handleRemoveAdvisor} className="space-y-4">
              <CustomInput
                label="Advisor GUC email"
                type="email"
                placeholder="name@guc.edu.eg"
                hint="Cannot remove advisors with assigned students"
                value={removeEmail}
                onChange={(e) => setRemoveEmail(e.target.value)}
                disabled={removeLoading}
                icon={<Mail className="w-4 h-4" />}
              />
              <CustomButton
                type="submit"
                variant="danger"
                disabled={removeLoading}
                className="w-full"
              >
                {removeLoading ? 'Removing...' : 'Remove Advisor'}
              </CustomButton>
            </form>
          </Card>
        </div>

        {/* Advisors List */}
        <Card>
          <div className="mb-4">
            <h3 className="text-h3 font-semibold">Current Advisors ({advisors.length})</h3>
          </div>

          {loading ? (
            <div role="status" className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-info mx-auto"></div>
              <p className="text-on-surface-variant mt-2">Loading advisors...</p>
            </div>
          ) : advisors.length === 0 ? (
            <EmptyState
              icon={<AlertCircle className="w-12 h-12" />}
              title="No advisors found"
              description="Add an advisor using the form above to get started"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-container-low border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-caption font-medium text-on-surface-variant uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-on-surface-variant uppercase">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-on-surface-variant uppercase">
                      Assigned Students
                    </th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-on-surface-variant uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-caption font-medium text-on-surface-variant uppercase">
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {advisors.map((advisor) => (
                    <tr key={advisor._id} className="hover:bg-surface-container-low">
                      <td className="px-4 py-3 font-medium">{advisor.fullName}</td>
                      <td className="px-4 py-3 text-body text-on-surface-variant">{advisor.email}</td>
                      <td className="px-4 py-3">
                        <Badge tone={advisor.assignedStudentsCount > 0 ? 'indigo' : 'neutral'}>
                          {advisor.assignedStudentsCount} student{advisor.assignedStudentsCount !== 1 ? 's' : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={advisor.isActive ? 'emerald' : 'neutral'}>
                          {advisor.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-body text-on-surface-variant">
                        {new Date(advisor.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!pendingRemoval}
        title="Remove advisor?"
        message={
          <>
            The advisor with email <span className="font-medium text-on-surface">{pendingRemoval}</span> will
            lose access to their advising roster. Advisors with assigned students cannot be removed.
          </>
        }
        confirmLabel="Remove advisor"
        tone="danger"
        isLoading={removeLoading}
        onConfirm={performRemoveAdvisor}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
