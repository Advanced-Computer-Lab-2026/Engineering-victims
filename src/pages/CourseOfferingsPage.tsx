import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Loader2,
  RotateCcw,
  Plus,
  Eye,
  ChevronRight,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { courseOfferingService } from '../lib/courseOfferingService';
import { AcademicTerm } from '../lib/types';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import { type CourseOffering } from '../lib/types';

// Note: I'll implement the OfferingDetailView separately or as a nested component
// For now, let's focus on the main page and the list.

const CourseOfferingsPage: React.FC = () => {
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // In a real app, we would fetch available terms from an AcademicTerm service.
  // For this demo, I'll assume we have some mock terms or the user can enter an ID.
  const [terms, setTerms] = useState<{ id: string; label: string }[]>([
    { id: 'mock-term-1', label: 'Winter 2026' },
    { id: 'mock-term-2', label: 'Spring 2026' },
  ]);

  const loadOfferings = useCallback(async (isRefresh = false) => {
    if (!selectedTerm) return;
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await courseOfferingService.getOfferingsByTerm(selectedTerm);
      setOfferings(response.offerings);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedTerm]);

  useEffect(() => {
    if (selectedTerm) {
      loadOfferings();
    }
  }, [selectedTerm, loadOfferings]);

  return (
    <>
      <PageHeader
        title="Course Offerings"
        description="Manage the specific instances of courses offered in each academic term."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="primary"
            size="sm"
            onClick={() => {
              // Logic to open Create Offering form
              alert('Create Offering form would open here');
            }}
            icon={<Plus className="h-4 w-4" aria-hidden />}
          >
            New Offering
          </CustomButton>
        }
      />

      <div className="mb-6 flex items-center gap-4">
        <Select
          label="Academic Term"
          placeholder="Select a term..."
          value={selectedTerm}
          onChange={(event) => setSelectedTerm(event.target.value)}
          options={terms.map(t => ({ value: t.id, label: t.label }))}
        />
        <CustomButton
          variant="secondary"
          size="sm"
          onClick={() => loadOfferings(true)}
          isLoading={isRefreshing}
          icon={<RotateCcw className="h-4 w-4" aria-hidden />}
        >
          Refresh
        </CustomButton>
      </div>

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Error" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading offerings...
        </Card>
      ) : offerings.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title={selectedTerm ? 'No offerings for this term' : 'Please select a term'}
          description={
            selectedTerm
              ? 'Courses have not been offered for the selected term yet.'
              : 'Select an academic term from the dropdown to see the course offerings.'
          }
        />
      ) : (
        <Card tone="raised" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Eligible Majors</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {offerings.map((offering) => (
                  <tr key={offering.id} className="group transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100">
                        {typeof offering.courseId === 'object' ? offering.courseId.name : 'Unknown'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {typeof offering.courseId === 'object' ? offering.courseId.code : 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        offering.publicationStatus === 'Published'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {offering.publicationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {offering.eligibleMajors.join(', ') || 'All'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CustomButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          alert(`Opening details for offering ${offering.id}`);
                        }}
                        icon={<Eye className="h-4 w-4" aria-hidden />}
                      >
                        View Details
                      </CustomButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
};

export default CourseOfferingsPage;
