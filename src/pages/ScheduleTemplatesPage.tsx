import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, BookOpen, CalendarDays, Loader2, Pencil, Plus, RotateCcw, Save, Search, Users } from 'lucide-react';
import AlertBanner from '../components/ui/AlertBanner';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import CustomInput from '../components/ui/CustomInput';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/PageHeader';
import Select from '../components/ui/Select';
import { ApiError } from '../lib/api';
import { fetchAcademicTerms } from '../lib/termsService';
import { EMPTY_FILTERS, type AcademicTerm, type ScheduleSlotOption, type ScheduleTemplate, type StudentSummary, type StudentsResponse, type TemplatePublicationStatus } from '../lib/types';
import { fetchStudents } from '../lib/studentsService';
import {
  assignStudentToScheduleGroup,
  createScheduleTemplate,
  fetchScheduleSlotOptions,
  fetchScheduleTemplates,
  ScheduleTemplateDraft,
  setScheduleTemplatePublication,
  updateScheduleTemplate,
} from '../lib/scheduleTemplatesService';

type WorkspaceView = 'templates' | 'students';

const SEMESTERS = Array.from({ length: 8 }, (_, index) => index + 1);
const termLabel = (term: AcademicTerm) => `${term.academicYear} ${term.season}`;

const ScheduleTemplatesPage: React.FC = () => {
  const [view, setView] = useState<WorkspaceView>('templates');
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [majors, setMajors] = useState<string[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [slots, setSlots] = useState<ScheduleSlotOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateMajor, setTemplateMajor] = useState('');
  const [templateSemester, setTemplateSemester] = useState('1');
  const [templateGroup, setTemplateGroup] = useState('');
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [studentMajor, setStudentMajor] = useState('');
  const [studentSemester, setStudentSemester] = useState('1');
  const [studentSearch, setStudentSearch] = useState('');
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [studentPage, setStudentPage] = useState(1);
  const [studentPages, setStudentPages] = useState(1);
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingStudentId, setPendingStudentId] = useState('');

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAcademicTerms(), fetchStudents(EMPTY_FILTERS, 1, 1)])
      .then(([termResponse, studentResponse]) => {
        if (cancelled) return;
        setTerms(termResponse.terms);
        setMajors(studentResponse.filterOptions.majors);
        setTemplateMajor(studentResponse.filterOptions.majors[0] ?? '');
        setStudentMajor(studentResponse.filterOptions.majors[0] ?? '');
        setSelectedTermId(termResponse.terms[0]?.id ?? '');
      })
      .catch((err) => {
        if (!cancelled) setError((err as ApiError).message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedTermId) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setIsLoadingTemplates(true);
    fetchScheduleTemplates(selectedTermId)
      .then((items) => { if (!cancelled) setTemplates(items); })
      .catch((err) => { if (!cancelled) setError((err as ApiError).message); })
      .finally(() => { if (!cancelled) setIsLoadingTemplates(false); });
    return () => { cancelled = true; };
  }, [selectedTermId]);

  useEffect(() => {
    if (!selectedTermId || !templateMajor) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setIsLoadingSlots(true);
    fetchScheduleSlotOptions(selectedTermId, templateMajor, Number(templateSemester))
      .then((items) => { if (!cancelled) setSlots(items); })
      .catch((err) => { if (!cancelled) setError((err as ApiError).message); })
      .finally(() => { if (!cancelled) setIsLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [selectedTermId, templateMajor, templateSemester]);

  const loadStudents = useCallback(async () => {
    setIsLoadingStudents(true);
    setError(null);
    try {
      const filters = {
        ...EMPTY_FILTERS,
        studentType: 'Normal Student',
        major: studentMajor,
        currentSemester: studentSemester,
        search: studentSearch,
      };
      const response: StudentsResponse = await fetchStudents(filters, studentPage, 25);
      setStudents(response.students);
      setStudentPages(response.pagination.totalPages);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsLoadingStudents(false);
    }
  }, [studentMajor, studentPage, studentSearch, studentSemester]);

  useEffect(() => {
    if (view !== 'students' || !studentMajor) return;
    loadStudents();
  }, [view, studentMajor, loadStudents]);

  const startNewTemplate = () => {
    setSelectedTemplateId('');
    setTemplateGroup('');
    setSelectedSlotIds([]);
    setNotice(null);
    setError(null);
  };

  const editTemplate = (template: ScheduleTemplate) => {
    setSelectedTemplateId(template.id);
    setTemplateMajor(template.major);
    setTemplateSemester(String(template.semester));
    setTemplateGroup(template.studyGroup);
    setSelectedSlotIds(template.slots.map((slot) => slot.id));
    setNotice(null);
    setError(null);
  };

  const handleSaveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);
    const draft: ScheduleTemplateDraft = {
      major: templateMajor,
      semester: Number(templateSemester),
      studyGroup: templateGroup.trim(),
      termId: selectedTermId,
      slots: selectedSlotIds,
    };
    try {
      const saved = selectedTemplateId
        ? await updateScheduleTemplate(selectedTemplateId, draft)
        : await createScheduleTemplate(draft);
      setTemplates((current) => {
        const next = current.filter((item) => item.id !== saved.id);
        return [...next, saved].sort((a, b) => a.major.localeCompare(b.major) || a.semester - b.semester || a.studyGroup.localeCompare(b.studyGroup));
      });
      setSelectedTemplateId(saved.id);
      setSelectedSlotIds(saved.slots.map((slot) => slot.id));
      setNotice(saved.publicationStatus === 'Draft'
        ? 'Template saved as a draft. Publish it before assigning students.'
        : 'Template updated. Existing student schedules are unchanged until those students are reassigned.');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublication = async (template: ScheduleTemplate) => {
    setError(null);
    setNotice(null);
    const nextStatus: TemplatePublicationStatus = template.publicationStatus === 'Published' ? 'Draft' : 'Published';
    try {
      const updated = await setScheduleTemplatePublication(template.id, nextStatus);
      setTemplates((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`“${updated.studyGroup}” is now ${nextStatus.toLowerCase()}.`);
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  const handleAssign = async (student: StudentSummary) => {
    const group = selectedGroups[student.id] ?? '';
    if (!group || !selectedTermId) return;
    if (student.studyGroup && !window.confirm(
      `Replace ${student.fullName}'s processed schedule for ${termLabel(terms.find((term) => term.id === selectedTermId)!)} with group ${group}?`
    )) return;

    setPendingStudentId(student.id);
    setError(null);
    setNotice(null);
    try {
      const result = await assignStudentToScheduleGroup(student.id, group, selectedTermId);
      setNotice(`${result.message} ${result.slotsCount} course slots processed.`);
      await loadStudents();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setPendingStudentId('');
    }
  };

  const availableGroups = templates.filter((template) =>
    template.publicationStatus === 'Published'
    && template.major === studentMajor
    && template.semester === Number(studentSemester)
    && template.termId === selectedTermId
  );
  const currentTerm = terms.find((term) => term.id === selectedTermId);

  return (
    <>
      <PageHeader
        title="Standard Schedule Groups"
        description="Create and publish group schedules, then assign normal students to build their processed schedules."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
      />

      {error && <div className="mb-4"><AlertBanner tone="error" title="Action could not be completed" onDismiss={() => setError(null)}>{error}</AlertBanner></div>}
      {notice && <div className="mb-4"><AlertBanner tone="success" onDismiss={() => setNotice(null)}>{notice}</AlertBanner></div>}

      <div className="mb-5 flex flex-wrap items-end gap-4 border-b border-slate-800 pb-5">
        <div className="w-full max-w-xs">
          <Select
            label="Academic term"
            value={selectedTermId}
            onChange={(event) => { setSelectedTermId(event.target.value); startNewTemplate(); }}
            options={terms.map((term) => ({ value: term.id, label: termLabel(term) }))}
            placeholder={isLoading ? 'Loading terms...' : 'Select a term'}
            disabled={isLoading || terms.length === 0}
          />
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/50 p-1" role="tablist" aria-label="Schedule group workspace">
          <button type="button" role="tab" aria-selected={view === 'templates'} onClick={() => setView('templates')} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${view === 'templates' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            <CalendarDays className="h-4 w-4" aria-hidden /> Templates
          </button>
          <button type="button" role="tab" aria-selected={view === 'students'} onClick={() => setView('students')} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${view === 'students' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            <Users className="h-4 w-4" aria-hidden /> Student assignments
          </button>
        </div>
      </div>

      {view === 'templates' ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]">
          <section aria-label="Schedule templates">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Templates for {currentTerm ? termLabel(currentTerm) : 'selected term'}</h2>
                <p className="mt-1 text-xs text-slate-500">Only published templates can be assigned.</p>
              </div>
              <CustomButton variant="secondary" size="sm" onClick={startNewTemplate} icon={<Plus className="h-4 w-4" aria-hidden />}>New template</CustomButton>
            </div>
            {isLoadingTemplates ? (
              <Card className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading templates...</Card>
            ) : templates.length === 0 ? (
              <EmptyState icon={<BookOpen className="h-5 w-5" />} title="No templates for this term" description="Create a group template from published course slots for a major and semester." />
            ) : (
              <Card tone="raised" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-left text-sm">
                    <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase text-slate-400">
                      <tr><th className="px-4 py-3 font-semibold">Major / Semester</th><th className="px-4 py-3 font-semibold">Group</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {templates.map((template) => (
                        <tr key={template.id} className={`transition-colors hover:bg-slate-800/40 ${selectedTemplateId === template.id ? 'bg-indigo-950/30' : ''}`}>
                          <td className="px-4 py-3"><div className="font-medium text-slate-100">{template.major}</div><div className="text-xs text-slate-500">Semester {template.semester}</div></td>
                          <td className="px-4 py-3 text-slate-200">{template.studyGroup}<div className="text-xs text-slate-500">{template.slots.length} slots</div></td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${template.publicationStatus === 'Published' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{template.publicationStatus}</span></td>
                          <td className="px-4 py-3 text-right"><div className="inline-flex items-center gap-1">
                            <button type="button" title="Edit template" aria-label={`Edit ${template.studyGroup}`} onClick={() => editTemplate(template)} className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-white"><Pencil className="h-4 w-4" aria-hidden /></button>
                            <button type="button" onClick={() => handlePublication(template)} className="rounded-md px-2.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/10 hover:text-indigo-200">{template.publicationStatus === 'Published' ? 'Unpublish' : 'Publish'}</button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

          <section aria-label={selectedTemplateId ? 'Edit schedule template' : 'Create schedule template'}>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-white">{selectedTemplateId ? 'Edit template' : 'Create template'}</h2>
              <p className="mt-1 text-xs text-slate-500">Choose published course slots that match the selected term, major, and semester.</p>
            </div>
            <Card tone="raised" className="p-5">
              <form onSubmit={handleSaveTemplate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Major" value={templateMajor} onChange={(event) => { setTemplateMajor(event.target.value); setSelectedSlotIds([]); }} options={majors.map((major) => ({ value: major, label: major }))} placeholder="Select a major" required />
                  <Select label="Semester" value={templateSemester} onChange={(event) => { setTemplateSemester(event.target.value); setSelectedSlotIds([]); }} options={SEMESTERS.map((semester) => ({ value: String(semester), label: `Semester ${semester}` }))} />
                </div>
                <CustomInput label="Study group" value={templateGroup} onChange={(event) => setTemplateGroup(event.target.value)} placeholder="e.g. G1" required />

                <fieldset>
                  <legend className="mb-2 text-xs font-medium uppercase text-slate-400">Course slots</legend>
                  {isLoadingSlots ? (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-800 p-4 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading published slots...</div>
                  ) : slots.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">No published course slots match this term, major, and semester.</p>
                  ) : (
                    <div className="max-h-72 divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800">
                      {slots.map((slot) => (
                        <label key={slot.id} className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-slate-800/50">
                          <input type="checkbox" checked={selectedSlotIds.includes(slot.id)} onChange={(event) => setSelectedSlotIds((current) => event.target.checked ? [...current, slot.id] : current.filter((id) => id !== slot.id))} className="mt-1 h-4 w-4 accent-indigo-500" />
                          <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-200">{slot.courseCode} · {slot.courseName}</span><span className="mt-0.5 block text-xs text-slate-500">{slot.slotType} {slot.groupNumber} · {slot.dayOfWeek}, {slot.startTime}–{slot.endTime} · {slot.roomId}</span></span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 text-xs text-slate-500">{selectedSlotIds.length} slots selected</p>
                </fieldset>

                {selectedTemplate?.publicationStatus === 'Published' && <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">Saving changes returns this template to draft. Existing processed schedules stay as they are until students are reassigned.</p>}
                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
                  {selectedTemplateId && <CustomButton type="button" variant="ghost" size="sm" onClick={startNewTemplate}>Cancel edit</CustomButton>}
                  <CustomButton type="submit" variant="primary" size="sm" isLoading={isSaving} disabled={!selectedTermId || !templateMajor || !templateGroup.trim() || selectedSlotIds.length === 0 || isLoadingSlots} icon={<Save className="h-4 w-4" aria-hidden />}>{selectedTemplateId ? 'Save changes' : 'Save draft'}</CustomButton>
                </div>
              </form>
            </Card>
          </section>
        </div>
      ) : (
        <section aria-label="Assign normal students to schedule groups">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_12rem_minmax(15rem,1.2fr)_auto] xl:items-end">
            <Select label="Major" value={studentMajor} onChange={(event) => { setStudentMajor(event.target.value); setStudentPage(1); }} options={majors.map((major) => ({ value: major, label: major }))} placeholder="Select a major" />
            <Select label="Semester" value={studentSemester} onChange={(event) => { setStudentSemester(event.target.value); setStudentPage(1); }} options={SEMESTERS.map((semester) => ({ value: String(semester), label: `Semester ${semester}` }))} />
            <CustomInput label="Find a student" value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value); setStudentPage(1); }} placeholder="Name, email, or student ID" icon={<Search className="h-4 w-4" aria-hidden />} />
            <CustomButton variant="secondary" size="sm" onClick={loadStudents} isLoading={isLoadingStudents} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>Refresh</CustomButton>
          </div>
          <p className="mb-3 text-xs text-slate-500">Assigning a group replaces the processed schedule for this term. Only published templates are available.</p>
          {availableGroups.length === 0 && <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">No published group templates match these filters. Create and publish one in Templates first.</div>}
          {isLoadingStudents ? (
            <Card className="flex items-center justify-center gap-2 p-16 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading normal students...</Card>
          ) : students.length === 0 ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title="No normal students found" description="Try another major, semester, or search term." />
          ) : (
            <Card tone="raised" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase text-slate-400"><tr><th className="px-4 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Major / Semester</th><th className="px-4 py-3 font-semibold">Current group</th><th className="px-4 py-3 font-semibold">Assign group</th><th className="px-4 py-3 text-right font-semibold">Action</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {students.map((student) => {
                      const groupValue = selectedGroups[student.id] ?? '';
                      return <tr key={student.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3"><div className="font-medium text-slate-100">{student.fullName}</div><div className="text-xs text-slate-500">{student.studentId} · {student.email}</div></td>
                        <td className="px-4 py-3 text-slate-300">{student.major}<div className="text-xs text-slate-500">Semester {student.currentSemester}</div></td>
                        <td className="px-4 py-3 text-slate-300">{student.studyGroup ?? 'Unassigned'}</td>
                        <td className="w-52 px-4 py-3"><select aria-label={`Schedule group for ${student.fullName}`} value={groupValue} onChange={(event) => setSelectedGroups((current) => ({ ...current, [student.id]: event.target.value }))} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"><option value="">Select group</option>{availableGroups.map((template) => <option key={template.id} value={template.studyGroup}>{template.studyGroup}</option>)}</select></td>
                        <td className="px-4 py-3 text-right"><CustomButton size="sm" variant="primary" disabled={!groupValue || pendingStudentId === student.id} isLoading={pendingStudentId === student.id} onClick={() => handleAssign(student)} icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}>{student.studyGroup ? 'Reassign' : 'Assign'}</CustomButton></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
                <span>Page {studentPage} of {studentPages}</span>
                <div className="flex gap-2"><CustomButton size="sm" variant="secondary" disabled={studentPage <= 1} onClick={() => setStudentPage((page) => Math.max(1, page - 1))}>Previous</CustomButton><CustomButton size="sm" variant="secondary" disabled={studentPage >= studentPages} onClick={() => setStudentPage((page) => Math.min(studentPages, page + 1))}>Next</CustomButton></div>
              </div>
            </Card>
          )}
        </section>
      )}
    </>
  );
};

export default ScheduleTemplatesPage;