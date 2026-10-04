import React, { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import { importCourses } from '../lib/coursesService';
import type { CourseImportErrorResponse, CourseImportResult, CourseImportRowError } from '../lib/types';
import AlertBanner from './ui/AlertBanner';
import CustomButton from './ui/CustomButton';

interface CourseImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: CourseImportResult) => void;
}

const TEMPLATE_HEADER = [
  'code',
  'name',
  'creditHours',
  'lectureHours',
  'tutorialHours',
  'labHours',
  'courseType',
  'faculty',
  'majors',
  'recommendedSemester',
  'offeringSeasons',
  'prerequisites',
];

// The second example depends on the first, to show a prerequisite from the same file.
const TEMPLATE_ROWS = [
  ['CSEN 991', 'Example Core Course', '6', '2', '2', '2', 'Core', 'MET', 'Computer Science;DMET', '3', 'Winter', ''],
  ['CSEN 992', 'Example Elective', '4', '2', '2', '0', 'Elective', 'MET', 'Computer Science', '7', 'Winter;Spring', 'CSEN 991'],
];

const TEMPLATE_CSV = [TEMPLATE_HEADER, ...TEMPLATE_ROWS].map((row) => row.join(',')).join('\r\n') + '\r\n';

// The server accepts JSON bodies up to 100 KB; that is well over a thousand courses.
const MAX_FILE_BYTES = 90 * 1024;

const downloadTemplate = () => {
  const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'course-import-template.csv';
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Req 128: import courses into the catalogue from a CSV file. The server
 * checks every row first; if any is invalid nothing is saved and the problems
 * are listed here row by row.
 */
const CourseImportDialog: React.FC<CourseImportDialogProps> = ({ open, onClose, onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<CourseImportRowError[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Every opening starts clean.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    setRowErrors([]);
    if (inputRef.current) inputRef.current.value = '';
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isImporting) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isImporting, onClose]);

  if (!open) return null;

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
    setRowErrors([]);
  };

  const handleImport = async () => {
    if (!file) return;
    setError(null);
    setRowErrors([]);

    if (file.size > MAX_FILE_BYTES) {
      setError('This file is too large to import at once. Split it into smaller files of under 90 KB.');
      return;
    }

    setIsImporting(true);
    try {
      const result = await importCourses(await file.text());
      onImported(result);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Could not import the file.');
      const data = apiError.data as Partial<CourseImportErrorResponse> | undefined;
      // A file-level problem repeats the banner's sentence, so it is not listed twice.
      const errors = Array.isArray(data?.errors) ? data.errors : [];
      setRowErrors(
        errors.filter((item) => !(item.row === null && item.messages.length === 1 && item.messages[0] === apiError.message))
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isImporting ? undefined : onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-import-title"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-slate-800 p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-800/60 bg-indigo-950/60 text-indigo-300">
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="course-import-title" className="text-base font-bold text-white">
              Import courses from CSV
            </h2>
            <p className="text-sm leading-relaxed text-slate-400">
              Rows with a new course code are created; rows with a code already in the catalogue update that course.
              If any row is invalid, nothing is imported until the file is corrected.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-400">
            <p>
              Required columns: <span className="font-mono text-slate-300">code, name, creditHours, courseType, faculty,
              majors, recommendedSemester, offeringSeasons, prerequisites</span>. Optional:{' '}
              <span className="font-mono text-slate-300">lectureHours, tutorialHours, labHours</span>.
            </p>
            <p className="mt-2">
              Separate several majors, seasons or prerequisites with a semicolon (
              <span className="font-mono text-slate-300">Winter;Spring</span>). Course type is Core, Elective or Huma;
              majors are Computer Science, DMET or Both. Prerequisites are course codes from the catalogue or from the
              same file; leave the cell empty for none.
            </p>
            <div className="mt-3">
              <CustomButton
                variant="secondary"
                size="sm"
                onClick={downloadTemplate}
                icon={<Download className="h-3.5 w-3.5" aria-hidden />}
              >
                Download template
              </CustomButton>
            </div>
          </div>

          <div>
            <label htmlFor="course-import-file" className="mb-1.5 block text-sm font-medium text-slate-300">
              CSV file
            </label>
            <input
              ref={inputRef}
              id="course-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={chooseFile}
              disabled={isImporting}
              className="block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900/70 text-sm text-slate-300 file:mr-3 file:cursor-pointer file:border-0 file:bg-slate-800 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-slate-200 hover:file:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            />
          </div>

          {error && (
            <AlertBanner tone="error" title="Nothing was imported">
              {error}
            </AlertBanner>
          )}

          {rowErrors.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th scope="col" className="w-16 px-3 py-2 font-semibold">Row</th>
                    <th scope="col" className="w-28 px-3 py-2 font-semibold">Code</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Problems</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rowErrors.map((rowError, index) => (
                    <tr key={`${rowError.row ?? 'file'}-${index}`} className="align-top">
                      <td className="px-3 py-2 text-slate-300">{rowError.row ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-indigo-300">{rowError.code ?? '—'}</td>
                      <td className="px-3 py-2 text-rose-200">
                        <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
                          {rowError.messages.map((message) => (
                            <li key={message}>{message}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 p-6">
          <CustomButton variant="secondary" disabled={isImporting} onClick={onClose}>
            Cancel
          </CustomButton>
          <CustomButton
            onClick={handleImport}
            disabled={!file}
            isLoading={isImporting}
            icon={<Upload className="h-4 w-4" aria-hidden />}
          >
            Import
          </CustomButton>
        </div>
      </div>
    </div>
  );
};

export default CourseImportDialog;
