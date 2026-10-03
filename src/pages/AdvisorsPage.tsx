import { useState, useEffect } from 'react';
import { UserPlus, UserMinus, Mail, AlertCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import CustomInput from '../components/ui/CustomInput';
import CustomButton from '../components/ui/CustomButton';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import AlertBanner from '../components/ui/AlertBanner';
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

  useEffect(() => {
    fetchAdvisors();
  }, []);

  const fetchAdvisors = async () => {
    try {
      setLoading(true);
      const response = await listAdvisors();
      console.log('Advisors fetched:', response);
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

  const handleRemoveAdvisor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!removeEmail.trim()) {
      setErrorMessage('Please enter an email address');
      return;
    }

    // Confirm before removing
    if (!confirm(`Are you sure you want to remove the advisor with email: ${removeEmail}?`)) {
      return;
    }

    try {
      setRemoveLoading(true);
      const response = await removeAdvisor(removeEmail.trim());
      setSuccessMessage(`${response.message}`);
      setRemoveEmail('');
      fetchAdvisors(); // Refresh list
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to remove advisor');
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Advisor Management"
        description="Add or remove advisors from the advising system"
      />

      <div className="p-6 space-y-6">
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
              <UserPlus className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-semibold">Add Advisor</h3>
            </div>
            <form onSubmit={handleAddAdvisor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Advisor GUC Email</label>
                <CustomInput
                  label=""
                  type="email"
                  placeholder="name@guc.edu.eg"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  disabled={addLoading}
                  icon={<Mail className="w-4 h-4" />}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter a valid GUC email address (@guc.edu.eg)
                </p>
              </div>
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
              <UserMinus className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold">Remove Advisor</h3>
            </div>
            <form onSubmit={handleRemoveAdvisor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Advisor GUC Email</label>
                <CustomInput
                  label=""
                  type="email"
                  placeholder="name@guc.edu.eg"
                  value={removeEmail}
                  onChange={(e) => setRemoveEmail(e.target.value)}
                  disabled={removeLoading}
                  icon={<Mail className="w-4 h-4" />}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cannot remove advisors with assigned students
                </p>
              </div>
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Current Advisors ({advisors.length})</h3>
            <CustomButton
              variant="secondary"
              onClick={fetchAdvisors}
              disabled={loading}
            >
              Refresh
            </CustomButton>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading advisors...</p>
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
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Assigned Students
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Added
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {advisors.map((advisor) => (
                    <tr key={advisor._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{advisor.fullName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{advisor.email}</td>
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
                      <td className="px-4 py-3 text-sm text-gray-500">
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
    </div>
  );
}
