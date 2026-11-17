import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Layers,
  Loader2,
  RotateCcw,
  Plus,
  Eye,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { courseOfferingService } from '../lib/courseOfferingService';
import { fetchAcademicTerms } from '../lib/termsService';
import { fetchCourses } from '../lib/coursesService';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import { type CourseOffering, type CourseSlot, type Course, type AcademicTerm } from '../lib/types';
import OfferingDrawer, { type OfferingDrawerMode } from '../components/OfferingDrawer';
import DuplicateOfferingsPanel from '../components/DuplicateOfferingsPanel';

const CourseOfferingsPage: React.FC = () => {
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data for the Offering Drawer & Duplicate Dialog
  const [courses, setCourses] = useState<Course[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [drawerMode, setDrawerMode] = useState<OfferingDrawerMode | null>(null);
  const [selectedOffering, setSelectedOffering] = useState<CourseOffering | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<CourseSlot[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAcademicTerms(),
      fetchCourses()
    ])
      .then(([termsRes, coursesRes]) => {
        if (cancelled) return;
        setTerms(termsRes.terms);
        setCourses(coursesRes.courses);
      })
      .catch((err) => {
        if (!cancelled) setError((err as ApiError).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOfferings = useCallback(async (isRefresh = false) => {
    if (!selectedTerm) return;
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await courseOfferingService.getOfferingsByTerm(selectedTerm);
      setOfferings(response.offerings ?? []);
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

  const handleOpenDetails = async (offering: CourseOffering) => {
    try {
      // Use the detail payload rather than the list row: it is the freshest
      // copy of the offering and already has its course and term populated.
      const res = await courseOfferingService.getOfferingDetails(offering.id);
      setSelectedOffering(res.offering);
      setSelectedSlots(res.slots);
      setDrawerMode('view');
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  /** Replaces the drawer's copy after a save so the view never shows the
   *  pre-edit values. */
  const handleDetailsRefreshed = (offering: CourseOffering, slots: CourseSlot[]) => {
    setSelectedOffering(offering);
    setSelectedSlots(slots);
  };

  const handleSaved = (termId?: string, message?: string) => {
    if (message) setNotice(message);
    // Land the filter on the offering's term so the row it just saved is on
    // screen; changing the filter reloads through the effect above.
    if (termId && termId !== selectedTerm) {
      setSelectedTerm(termId);
      return;
    }
    loadOfferings(true);
  };

  const handleSlotDeleted = (slotId: string) => {
    setSelectedSlots((current) => current.filter((slot) => slot.id !== slotId));
  };

  const handlePublicationChanged = (publicationStatus: CourseOffering['publicationStatus']) => {
    setSelectedOffering((current) => current ? { ...current, publicationStatus } : current);
  };

  return (
    <>
      <PageHeader
        title="Course Offerings"
        description="Manage the specific instances of courses offered in each academic term."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <CustomButton
              variant="secondary"
              size="sm"
              onClick={() => setShowDuplicateModal(true)}
              icon={<Layers className="h-4 w-4" aria-hidden />}
            >
              Duplicate Offerings
            </CustomButton>
            <CustomButton
              variant="primary"
              size="sm"
              onClick={() => {
                setSelectedOffering(null);
                setSelectedSlots([]);
                setNotice(null);
                setDrawerMode('create');
              }}
              icon={<Plus className="h-4 w-4" aria-hidden />}
            >
              New Offering
            </CustomButton>
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
        }
      />

      <div className="mb-6 flex items-center gap-4">
        <Select
          label="Academic Term"
          placeholder="Select a term..."
          value={selectedTerm}
          onChange={(event) => setSelectedTerm(event.target.value)}
          options={terms.map(t => ({ value: t.id, label: `${t.academicYear} ${t.season}` }))}
        />
      </div>

      {error && (
        <div className="mb-4">
          <AlertBanner tone="error" title="Error" onDismiss={() => setError(null)}>
            {error}
          </AlertBanner>
        </div>
      )}

      {notice && (
        <div className="mb-4">
          <AlertBanner tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
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
            <table className="w-full min-w-[40rem] text-left text-body">
              <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Eligible Majors</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {offerings.map((offering) => (
                  <tr key={offering.id} className="group transition-colors hover:bg-surface-container">
                    <td className="px-4 py-3">
                      {/* A deleted course leaves a null ref: `typeof null` is
                          'object', so the guard must check truthiness first. */}
                      <div className="font-medium text-on-surface">
                        {offering.courseId && typeof offering.courseId === 'object'
                          ? offering.courseId.name
                          : 'Unknown course'}
                      </div>
                      <div className="text-caption text-on-surface-variant font-mono">
                        {offering.courseId && typeof offering.courseId === 'object'
                          ? offering.courseId.code
                          : 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-caption font-semibold ${
                        offering.publicationStatus === 'Published'
                          ? 'bg-success-container text-success'
                          : 'bg-warning-container text-warning'
                      }`}>
                        {offering.publicationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface text-caption">
                      {offering.eligibleMajors?.join(', ') || 'All'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CustomButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDetails(offering)}
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

      <OfferingDrawer
        mode={drawerMode}
        offering={selectedOffering}
        slots={selectedSlots}
        courses={courses}
        terms={terms}
        onClose={() => setDrawerMode(null)}
        onModeChange={setDrawerMode}
        onSlotDeleted={handleSlotDeleted}
        onPublicationChanged={handlePublicationChanged}
        onDetailsRefreshed={handleDetailsRefreshed}
        onSaved={handleSaved}
      />

      {showDuplicateModal && (
        <DuplicateOfferingsPanel
          terms={terms}
          defaultTargetTermId={selectedTerm}
          onDuplicated={(targetTermId, message) => {
            handleSaved(targetTermId, message);
          }}
          onClose={() => setShowDuplicateModal(false)}
        />
      )}
    </>
  );
};

export default CourseOfferingsPage;
