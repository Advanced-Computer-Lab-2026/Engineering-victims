import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Clock,
  Eye,
  Layers,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { courseOfferingService } from '../lib/courseOfferingService';
import {
  Course,
  CourseOffering,
  CourseSlot,
  AcademicTerm,
} from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import CustomButton from './ui/CustomButton';
import CustomInput from './ui/CustomInput';
import Select from './ui/Select';
import Badge from './ui/Badge';

export type OfferingDrawerMode = 'view' | 'edit' | 'create';

interface OfferingDrawerProps {
  mode: OfferingDrawerMode | null;
  offering: CourseOffering | null;
  slots: CourseSlot[];
  courses: Course[];
  terms: AcademicTerm[];
  onClose: () => void;
  onModeChange: (mode: OfferingDrawerMode) => void;
  onSaved: () => void;
}

const emptyOfferingDraft = () => ({
  courseId: '',
  termId: '',
  publicationStatus: 'Draft' as const,
  eligibleMajors: [] as string[],
});

const OfferingDrawer: React.FC<OfferingDrawerProps> = ({
  mode,
  offering,
  slots,
  courses,
  terms,
  onClose,
  onModeChange,
  onSaved,
}) => {
  const [offeringDraft, setOfferingDraft] = useState(emptyOfferingDraft());
  const [slotsDraft, setSlotsDraft] = useState<CourseSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setError(null);
    setNotice(null);
    if (mode === 'create') {
      setOfferingDraft(emptyOfferingDraft());
      setSlotsDraft([]);
    } else if (mode === 'edit' && offering) {
      setOfferingDraft({
        courseId: typeof offering.courseId === 'object' ? offering.courseId.id : offering.courseId,
        termId: offering.termId as string,
        publicationStatus: offering.publicationStatus,
        eligibleMajors: [...offering.eligibleMajors],
      });
      setSlotsDraft([...slots]);
    }
  }, [mode, offering, slots]);

  if (!mode) return null;

  const isForm = mode !== 'view';

  const addSlot = () => {
    const newSlot: CourseSlot = {
      id: 'new',
      offeringId: offering?.id || '',
      instructorId: '',
      slotType: 'Lecture',
      groupNumber: 1,
      dayOfWeek: 'Monday',
      startTime: '08:00',
      endTime: '10:00',
      roomId: '',
      maxCapacity: 40,
      assignedCount: 0,
    };
    setSlotsDraft((current) => [...current, newSlot]);
  };

  const removeSlot = (id: string) => {
    setSlotsDraft((current) => current.filter((s) => s.id !== id));
  };

  const updateSlot = (id: string, updates: Partial<CourseSlot>) => {
    setSlotsDraft((current) =>
      current.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      if (mode === 'edit' && offering) {
        await courseOfferingService.updateOffering(offering.id, offeringDraft);
        for (const slot of slotsDraft) {
          if (slot.id !== 'new') {
            await courseOfferingService.updateSlot(slot.id, slot);
          }
        }
        setNotice('Offering and slots updated successfully.');
      } else {
        // Req 23: Create Offering and its slots
        const res = await courseOfferingService.createOffering({
          ...offeringDraft,
          slots: slotsDraft
        });
        setNotice('New offering and slots created.');
      }
      onSaved();
      onModeChange('view');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">
              {mode === 'create' ? 'New Offering' : mode === 'edit' ? 'Edit Offering' : 'Offering Details'}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-400">
              {offering ? (typeof offering.courseId === 'object' ? offering.courseId.code : offering.courseId) : 'Configure a new course offering'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isForm && offering && (
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {notice && <AlertBanner tone="success" onDismiss={() => setNotice(null)}>{notice}</AlertBanner>}

            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">General Info</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex flex-col">
                  <dt className="text-slate-500">Status</dt>
                  <dd><Badge tone={offering.publicationStatus === 'Published' ? 'emerald' : 'amber'}>{offering.publicationStatus}</Badge></dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-slate-500">Eligible Majors</dt>
                  <dd className="text-slate-200">{offering.eligibleMajors.join(', ') || 'All'}</dd>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Slots</h3>
              <div className="space-y-3">
                {slots.map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                    <div className="flex gap-4">
                      <Badge tone="indigo">{slot.slotType}</Badge>
                      <span className="text-slate-200 font-mono">{slot.dayOfWeek} {slot.startTime}-{slot.endTime}</span>
                      <span className="text-slate-400">{slot.roomId}</span>
                    </div>
                    <span className="text-xs text-slate-500">Cap: {slot.maxCapacity}</span>
                  </div>
                ))}
                {slots.length === 0 && <p className="text-sm text-slate-500">No slots defined.</p>}
              </div>
            </section>

            <div className="flex justify-end border-t border-slate-800 pt-4">
              <CustomButton onClick={() => onModeChange('edit')} icon={<Pencil className="h-4 w-4" />}>
                Edit Offering
              </CustomButton>
            </div>
          </div>
        )}

        {isForm && (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {error && <AlertBanner tone="error" onDismiss={() => setError(null)}>{error}</AlertBanner>}

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Course"
                  value={offeringDraft.courseId}
                  onChange={(e) => setOfferingDraft(c => ({ ...c, courseId: e.target.value }))}
                  options={courses.map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }))}
                  required
                />
                <Select
                  label="Term"
                  value={offeringDraft.termId}
                  onChange={(e) => setOfferingDraft(c => ({ ...c, termId: e.target.value }))}
                  options={terms.map(t => ({ value: t.id, label: `${t.academicYear} ${t.season}` }))}
                  required
                />
                <Select
                  label="Publication Status"
                  value={offeringDraft.publicationStatus}
                  onChange={(e) => setOfferingDraft(c => ({ ...c, publicationStatus: e.target.value as any }))}
                  options={[{ value: 'Draft', label: 'Draft' }, { value: 'Published', label: 'Published' }]}
                />
                <CustomInput
                  label="Eligible Majors (comma separated)"
                  value={offeringDraft.eligibleMajors.join(', ')}
                  onChange={(e) => setOfferingDraft(c => ({ ...c, eligibleMajors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300">Course Slots</h3>
                  <CustomButton size="sm" onClick={addSlot} icon={<Plus className="h-3 w-3" />}>Add Slot</CustomButton>
                </div>

                <div className="space-y-4">
                  {slotsDraft.map((slot, index) => (
                    <div key={slot.id} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold uppercase text-slate-500">Slot #{index + 1}</span>
                        <button type="button" onClick={() => removeSlot(slot.id)} className="text-rose-400 hover:text-rose-300">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Select
                          label="Type"
                          value={slot.slotType}
                          onChange={(e) => updateSlot(slot.id, { slotType: e.target.value as any })}
                          options={[{ value: 'Lecture', label: 'Lecture' }, { value: 'Tutorial', label: 'Tutorial' }, { value: 'Lab', label: 'Lab' }]}
                        />
                        <Select
                          label="Day"
                          value={slot.dayOfWeek}
                          onChange={(e) => updateSlot(slot.id, { dayOfWeek: e.target.value as any })}
                          options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => ({ value: d, label: d }))}
                        />
                        <CustomInput
                          label="Start Time"
                          type="time"
                          value={slot.startTime}
                          onChange={(e) => updateSlot(slot.id, { startTime: e.target.value })}
                        />
                        <CustomInput
                          label="End Time"
                          type="time"
                          value={slot.endTime}
                          onChange={(e) => updateSlot(slot.id, { endTime: e.target.value })}
                        />
                        <CustomInput
                          label="Room ID"
                          value={slot.roomId}
                          onChange={(e) => updateSlot(slot.id, { roomId: e.target.value })}
                        />
                        <CustomInput
                          label="Max Capacity"
                          type="number"
                          value={slot.maxCapacity}
                          onChange={(e) => updateSlot(slot.id, { maxCapacity: Number(e.target.value) })}
                        />
                        <CustomInput
                          label="Instructor ID"
                          value={slot.instructorId}
                          onChange={(e) => updateSlot(slot.id, { instructorId: e.target.value })}
                        />
                        <CustomInput
                          label="Group #"
                          type="number"
                          value={slot.groupNumber}
                          onChange={(e) => updateSlot(slot.id, { groupNumber: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  ))}
                  {slotsDraft.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                      No slots added yet. Click "Add Slot" to begin.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
              <CustomButton variant="ghost" onClick={() => (mode === 'edit' ? onModeChange('view') : onClose())} type="button">
                Cancel
              </CustomButton>
              <CustomButton type="submit" isLoading={isSaving} icon={mode === 'edit' ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}>
                {mode === 'edit' ? 'Save Changes' : 'Create Offering'}
              </CustomButton>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
};

export default OfferingDrawer;
