import React, { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
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
  const trapRef = useFocusTrap<HTMLDivElement>(open);

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
    <div className="fixed inset-0 z-toast flex items-center justify-center p-4">
      <div
        className="absolute inset-0 scrim backdrop-blur-sm"
        onClick={isImporting ? undefined : onClose}
        aria-hidden
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-import-title"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-outline-variant p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary bg-primary-container text-on-primary-container">
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="course-import-title" className="text-body-lg font-bold text-on-surface">
              Import courses from CSV
            </h2>
            <p className="text-body leading-relaxed text-on-surface-variant">
              Rows with a new course code are created; rows with a code already in the catalogue update that course.
              If any row is invalid, nothing is imported until the file is corrected.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-caption leading-relaxed text-on-surface-variant">
            <p>
              Required columns: <span className="font-mono text-on-surface">code, name, creditHours, courseType, faculty,
              majors, recommendedSemester, offeringSeasons, prerequisites</span>. Optional:{' '}
              <span className="font-mono text-on-surface">lectureHours, tutorialHours, labHours</span>.
            </p>
            <p className="mt-2">
              Separate several majors, seasons or prerequisites with a semicolon (
              <span className="font-mono text-on-surface">Winter;Spring</span>). Course type is Core, Elective or Huma;
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
            <label htmlFor="course-import-file" className="mb-1.5 block text-body font-medium text-on-surface">
              CSV file
            </label>
            <input
              ref={inputRef}
              id="course-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={chooseFile}
              disabled={isImporting}
              className="block w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-container-low text-body text-on-surface file:mr-3 file:cursor-pointer file:border-0 file:bg-surface-container file:px-4 file:py-2.5 file:text-body file:font-semibold file:text-on-surface hover:file:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <AlertBanner tone="error" title="Nothing was imported">
              {error}
            </AlertBanner>
          )}

          {rowErrors.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-outline-variant">
              <table className="w-full text-left text-body">
                <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                  <tr>
                    <th scope="col" className="w-16 px-3 py-2 font-semibold">Row</th>
                    <th scope="col" className="w-28 px-3 py-2 font-semibold">Code</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Problems</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {rowErrors.map((rowError, index) => (
                    <tr key={`${rowError.row ?? 'file'}-${index}`} className="align-top">
                      <td className="px-3 py-2 text-on-surface">{rowError.row ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-caption text-primary">{rowError.code ?? '—'}</td>
                      <td className="px-3 py-2 text-error">
                        <ul className="list-disc space-y-0.5 pl-4 text-code">
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

        <div className="flex justify-end gap-2 border-t border-outline-variant p-6">
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
