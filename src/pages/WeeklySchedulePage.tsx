import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Coffee, Download, Eye, FileText, Loader2, MapPin, Printer, RotateCcw, UserRound } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PageHeader from '../components/PageHeader';
import StudentPreferencesPanel from '../components/StudentPreferencesPanel';
import CalendarSyncPanel from '../components/CalendarSyncPanel';
import AlertBanner from '../components/ui/AlertBanner';
import Badge, { type BadgeTone } from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { useSession } from '../hooks/useSession';
import { ApiError } from '../lib/api';
import { fetchMySchedule, fetchStudentSchedule } from '../lib/weeklyScheduleService';
import type { ScheduleSession, ScheduleStage, WeeklyScheduleResponse } from '../lib/types';

/** Lecture, tutorial and lab read apart at a glance, in the grid and the list. */
const TYPE_STYLE: Record<ScheduleSession['slotType'], { tone: BadgeTone; card: string }> = {
  Lecture: { tone: 'indigo', card: 'border-primary bg-primary-container' },
  Tutorial: { tone: 'sky', card: 'border-info bg-info-container' },
  Lab: { tone: 'emerald', card: 'border-success bg-success-container' },
};

const STAGE_INFO: Record<ScheduleStage, { tone: BadgeTone; label: string; staffNote: string }> = {
  Draft: {
    tone: 'amber',
    label: 'Incomplete draft',
    staffNote: 'The Advisor is still building this draft, so the student cannot see it yet.',
  },
  'Review-ready': {
    tone: 'sky',
    label: 'Completed draft',
    staffNote: 'This draft is complete and visible to the student.',
  },
  Processed: { tone: 'emerald', label: 'Processed', staffNote: 'This is the final processed schedule.' },
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Req 31: a student's current weekly schedule as a weekly calendar.
 *
 * /schedule is the signed-in student's own schedule (the API reads it from the
 * token and applies the visibility rules); /schedule/:studentId is the
 * read-only staff view of a student's schedule.
 */
const WeeklySchedulePage: React.FC = () => {
  const { studentId } = useParams<{ studentId?: string }>();
  const { user } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<WeeklyScheduleResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isOwn = !studentId;

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      try {
        setData(studentId ? await fetchStudentSchedule(studentId) : await fetchMySchedule());
      } catch (err) {
        setError(err as ApiError);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Every distinct time block in this schedule becomes a calendar row.
  const timeBlocks = useMemo(() => {
    const blocks = new Map<string, { start: string; end: string }>();
    (data?.sessions ?? []).forEach((session) =>
      blocks.set(`${session.startTime}-${session.endTime}`, { start: session.startTime, end: session.endTime })
    );
    return [...blocks.values()].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  }, [data]);

  const backTo = user?.role === 'Advisor' ? '/advising-students' : '/students';
  const student = data?.student;
  const stage = data?.stage ? STAGE_INFO[data.stage] : null;
  const canViewPreferences =
    !isOwn &&
    (user?.role === 'Advisor' || user?.role === 'Coordinator') &&
    student?.studentType === 'Advising Student';

  /**
   * Req 49: Print the schedule using browser print dialog.
   * Uses CSS media queries to optimize for printing.
   */
  const handlePrint = () => {
    window.print();
  };

  /**
   * Req 49: Download the schedule as a professional PDF.
   * Uses jsPDF to create a well-formatted, paginated PDF document.
   */
  const handleDownloadPDF = () => {
    if (!data || !student) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let yPosition = margin;

    // Helper to add new page if needed
    const checkPageBreak = (neededSpace: number) => {
      if (yPosition + neededSpace > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
        return true;
      }
      return false;
    };

    // === HEADER ===
    doc.setFillColor(79, 70, 229); // Indigo
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('WEEKLY SCHEDULE', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('GUC University Schedule Management System', pageWidth / 2, 25, { align: 'center' });
    
    if (data.term) {
      doc.text(`${data.term.label}`, pageWidth / 2, 32, { align: 'center' });
    }

    yPosition = 50;

    // === STUDENT INFO BOX ===
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(243, 244, 246); // Light gray
    doc.roundedRect(margin, yPosition, pageWidth - 2 * margin, 30, 3, 3, 'F');
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(student.fullName, margin + 5, yPosition + 8);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student ID: ${student.studentId}`, margin + 5, yPosition + 15);
    doc.text(`Major: ${student.major}`, margin + 5, yPosition + 21);
    doc.text(`Semester: ${student.currentSemester}`, margin + 70, yPosition + 21);
    if (student.studyGroup) {
      doc.text(`Group: ${student.studyGroup}`, margin + 120, yPosition + 21);
    }

    yPosition += 40;

    if (data.sessions.length === 0) {
      checkPageBreak(20);
      doc.setFontSize(11);
      doc.text('No sessions scheduled for this term.', margin, yPosition);
      doc.save(`schedule_${student.studentId}_${data.term?.label.replace(/\s+/g, '_') || 'current'}.pdf`);
      return;
    }

    // === SCHEDULE BY DAY ===
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Weekly Schedule', margin, yPosition);
    yPosition += 8;

    data.days.forEach((day) => {
      const daySessions = data.sessions.filter((s) => s.dayOfWeek === day);
      const isDayOff = data.daysOff.includes(day);

      checkPageBreak(15);

      // Day header
      doc.setFillColor(99, 102, 241); // Indigo
      doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${day}${isDayOff ? ' (Day Off)' : ''}`, margin + 3, yPosition + 5.5);
      yPosition += 10;

      doc.setTextColor(0, 0, 0);

      if (daySessions.length === 0) {
        checkPageBreak(8);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('No classes', margin + 5, yPosition + 4);
        yPosition += 8;
      } else {
        // Sort sessions by time
        const sortedSessions = daySessions.sort((a, b) => a.startTime.localeCompare(b.startTime));

        sortedSessions.forEach((session) => {
          checkPageBreak(18);

          // Session box
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.rect(margin + 5, yPosition, pageWidth - 2 * margin - 10, 16);

          // Time and type badge
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.text(`${session.startTime} - ${session.endTime}`, margin + 8, yPosition + 5);
          
          // Type badge
          const badgeColors: Record<string, [number, number, number]> = {
            Lecture: [99, 102, 241],    // Indigo
            Tutorial: [14, 165, 233],   // Sky
            Lab: [16, 185, 129],        // Emerald
          };
          const [r, g, b] = badgeColors[session.slotType] || [100, 100, 100];
          doc.setFillColor(r, g, b);
          doc.roundedRect(margin + 55, yPosition + 1.5, 20, 5, 1, 1, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(7);
          doc.text(session.slotType, margin + 65, yPosition + 4.5, { align: 'center' });

          // Course info
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(session.courseCode, margin + 8, yPosition + 10);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          const courseName = session.courseName.length > 45 ? session.courseName.substring(0, 45) + '...' : session.courseName;
          doc.text(courseName, margin + 35, yPosition + 10);

          // Details
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 80);
          doc.text(`Room: ${session.room}`, margin + 8, yPosition + 14);
          doc.text(`Group ${session.groupNumber}`, margin + 40, yPosition + 14);
          if (session.instructor) {
            const instructor = session.instructor.length > 30 ? session.instructor.substring(0, 30) + '...' : session.instructor;
            doc.text(`Instructor: ${instructor}`, margin + 65, yPosition + 14);
          }

          yPosition += 18;
        });
      }

      yPosition += 3;
    });

    // === SUMMARY TABLE ===
    checkPageBreak(40);
    yPosition += 5;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('All Sessions Summary', margin, yPosition);
    yPosition += 8;

    // Prepare table data
    const tableData = data.sessions
      .sort((a, b) => {
        const dayDiff = data.days.indexOf(a.dayOfWeek) - data.days.indexOf(b.dayOfWeek);
        if (dayDiff !== 0) return dayDiff;
        return a.startTime.localeCompare(b.startTime);
      })
      .map((session) => [
        session.courseCode,
        session.courseName.substring(0, 30),
        session.slotType,
        session.dayOfWeek.substring(0, 3),
        `${session.startTime}-${session.endTime}`,
        session.room,
        `G${session.groupNumber}`,
      ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Code', 'Course', 'Type', 'Day', 'Time', 'Room', 'Group']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [99, 102, 241],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: 50,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 22 },  // Code
        1: { cellWidth: 45 },  // Course
        2: { cellWidth: 20 },  // Type
        3: { cellWidth: 18 },  // Day
        4: { cellWidth: 28 },  // Time
        5: { cellWidth: 22 },  // Room
        6: { cellWidth: 15 },  // Group
      },
      margin: { left: margin, right: margin },
    });

    // === FOOTER ON LAST PAGE ===
    const finalY = (doc as any).lastAutoTable.finalY || yPosition;
    if (finalY < pageHeight - 30) {
      yPosition = finalY + 10;
    } else {
      doc.addPage();
      yPosition = margin;
    }

    // Statistics
    const uniqueCourses = new Set(data.sessions.map((s) => s.courseCode));
    checkPageBreak(25);
    
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(margin, yPosition, pageWidth - 2 * margin, 20, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Statistics', margin + 5, yPosition + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Total Courses: ${uniqueCourses.size}`, margin + 5, yPosition + 12);
    doc.text(`Total Sessions: ${data.sessions.length}`, margin + 60, yPosition + 12);
    if (data.daysOff.length > 0) {
      doc.text(`Days Off: ${data.daysOff.join(', ')}`, margin + 5, yPosition + 17);
    }

    yPosition += 25;

    // Generation info
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);

    // Save PDF
    doc.save(`schedule_${student.studentId}_${data.term?.label.replace(/\s+/g, '_') || 'current'}.pdf`);
  };

  /**
   * Download as plain text (legacy option)
   */
  const handleDownloadText = () => {
    if (!data || !student) return;

    const lines: string[] = [];
    
    // Header
    lines.push('═'.repeat(80));
    lines.push(`WEEKLY SCHEDULE - ${student.fullName}`);
    lines.push('═'.repeat(80));
    lines.push(`Student ID: ${student.studentId}`);
    lines.push(`Major: ${student.major} | Semester: ${student.currentSemester}`);
    if (student.studyGroup) {
      lines.push(`Study Group: ${student.studyGroup}`);
    }
    if (data.term) {
      lines.push(`Term: ${data.term.label}`);
      lines.push(`Period: ${new Date(data.term.termStartDate).toLocaleDateString()} - ${new Date(data.term.termEndDate).toLocaleDateString()}`);
    }
    lines.push('═'.repeat(80));
    lines.push('');

    if (data.sessions.length === 0) {
      lines.push('No sessions scheduled for this term.');
    } else {
      // Group by day
      data.days.forEach((day) => {
        const daySessions = data.sessions.filter((s) => s.dayOfWeek === day);
        
        if (daySessions.length > 0 || data.daysOff.includes(day)) {
          lines.push('─'.repeat(80));
          lines.push(`${day.toUpperCase()}${data.daysOff.includes(day) ? ' (Day Off)' : ''}`);
          lines.push('─'.repeat(80));
          
          if (daySessions.length === 0) {
            lines.push('  No classes');
          } else {
            // Sort by time
            daySessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
            
            daySessions.forEach((session) => {
              lines.push('');
              lines.push(`  ${session.startTime} - ${session.endTime}`);
              lines.push(`  ${session.courseCode} - ${session.courseName}`);
              lines.push(`  ${session.slotType} (Group ${session.groupNumber})`);
              lines.push(`  Room: ${session.room}`);
              if (session.instructor) {
                lines.push(`  Instructor: ${session.instructor}`);
              }
            });
          }
          lines.push('');
        }
      });

      // Summary
      lines.push('═'.repeat(80));
      lines.push('SUMMARY');
      lines.push('═'.repeat(80));
      
      // Count unique courses
      const uniqueCourses = new Set(data.sessions.map((s) => s.courseCode));
      lines.push(`Total Courses: ${uniqueCourses.size}`);
      lines.push(`Total Sessions: ${data.sessions.length}`);
      
      if (data.daysOff.length > 0) {
        lines.push(`Days Off: ${data.daysOff.join(', ')}`);
      }
      
      lines.push('');
      lines.push('─'.repeat(80));
      lines.push('All Sessions:');
      lines.push('─'.repeat(80));
      
      // List all sessions in a table format
      const sortedSessions = [...data.sessions].sort((a, b) => {
        const dayDiff = data.days.indexOf(a.dayOfWeek) - data.days.indexOf(b.dayOfWeek);
        if (dayDiff !== 0) return dayDiff;
        return a.startTime.localeCompare(b.startTime);
      });
      
      sortedSessions.forEach((session) => {
        lines.push(
          `${session.courseCode.padEnd(12)} | ${session.slotType.padEnd(8)} | ` +
          `${session.dayOfWeek.padEnd(10)} | ${session.startTime}-${session.endTime} | ` +
          `${session.room.padEnd(10)} | G${session.groupNumber}`
        );
      });
    }

    lines.push('');
    lines.push('═'.repeat(80));
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('GUC University Schedule Management System');
    lines.push('═'.repeat(80));

    // Create and download file
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `schedule_${student.studentId}_${data.term?.label.replace(/\s+/g, '_') || 'current'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title={isOwn ? 'My Schedule' : student ? `${student.fullName}'s Schedule` : 'Weekly Schedule'}
        description={
          data?.term
            ? `Weekly schedule for ${data.term.label}: lectures, tutorials and labs with their times and rooms.`
            : 'Lectures, tutorials and labs with their times and rooms.'
        }
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <div className="flex gap-2">
            {!isOwn && (
              <CustomButton
                variant="secondary"
                size="sm"
                onClick={() => navigate(backTo)}
                icon={<ArrowLeft className="h-4 w-4" aria-hidden />}
              >
                Back to students
              </CustomButton>
            )}
            {!isOwn &&
              student?.studentType === 'Advising Student' &&
              (user?.role === 'Advisor' || user?.role === 'Coordinator') && (
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/advising-schedules/${student.id}/draft`)}
                  icon={<CalendarDays className="h-4 w-4" aria-hidden />}
                >
                  Create or edit draft
                </CustomButton>
              )}
            {/* Req 49: Download and print buttons for processed schedules */}
            {data?.visible && data.sessions.length > 0 && (
              <>
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadPDF}
                  icon={<Download className="h-4 w-4" aria-hidden />}
                  title="Download schedule as PDF"
                >
                  PDF
                </CustomButton>
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadText}
                  icon={<FileText className="h-4 w-4" aria-hidden />}
                  title="Download schedule as text file"
                >
                  Text
                </CustomButton>
                <CustomButton
                  variant="secondary"
                  size="sm"
                  onClick={handlePrint}
                  icon={<Printer className="h-4 w-4" aria-hidden />}
                  title="Print schedule"
                >
                  Print
                </CustomButton>
              </>
            )}
            <CustomButton
              variant="secondary"
              size="sm"
              onClick={() => load(true)}
              isLoading={isRefreshing}
              icon={<RotateCcw className="h-4 w-4" aria-hidden />}
            >
              Refresh
            </CustomButton>
          </div>
        }
      />

      {isOwn && user?.role === 'Student' && <CalendarSyncPanel processed={data?.stage === 'Processed' && Boolean(data?.visible)} />}

      {error && (
        <div className="mb-4">
          <AlertBanner
            tone={error.status === 403 ? 'info' : 'error'}
            title={error.status === 403 ? 'This schedule is not available to you' : 'Could not load the schedule'}
          >
            {error.message}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading schedule...
        </Card>
      ) : data && student ? (
        <div className="space-y-6">
          <Card tone="raised" className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-h3 font-bold text-on-surface">{student.fullName}</h2>
                <p className="font-mono text-caption text-on-surface-variant">
                  {student.studentId} · {student.major} · Semester {student.currentSemester}
                  {student.studyGroup ? ` · Group ${student.studyGroup}` : ''}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Badge tone={student.studentType === 'Advising Student' ? 'indigo' : 'sky'}>{student.studentType}</Badge>
                {data.term && <Badge tone="neutral">{data.term.label}</Badge>}
                {stage && (
                  <Badge tone={stage.tone} dot>
                    {stage.label}
                  </Badge>
                )}
              </div>
            </div>
            {!isOwn && stage && (
              <p className="mt-3 flex items-center gap-1.5 text-caption text-on-surface-variant">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                {stage.staffNote} Read-only view.
              </p>
            )}
          </Card>

          {/* Req 58: the student's preferences beside the draft, for Advisors and Coordinators. */}
          {canViewPreferences && studentId && <StudentPreferencesPanel studentId={studentId} />}

          {!data.visible ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title={isOwn ? 'Your schedule is not available yet' : 'No schedule to show'}
              description={data.hiddenReason ?? undefined}
            />
          ) : data.sessions.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title="No sessions this term"
              description="The schedule has no lectures, tutorials or labs registered for this term."
            />
          ) : (
            <>
              <Card tone="raised" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[56rem] table-fixed border-collapse text-left text-body">
                    <caption className="sr-only">Weekly calendar for {data.term?.label}</caption>
                    <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                      <tr>
                        <th scope="col" className="w-28 px-3 py-3 font-semibold">
                          Time
                        </th>
                        {data.days.map((day) => {
                          const isOff = data.daysOff.includes(day);
                          return (
                            <th key={day} scope="col" className="px-2 py-3 font-semibold">
                              <span className="block">{day}</span>
                              {isOff && (
                                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-container px-2 py-0.5 text-caption normal-case text-warning">
                                  <Coffee className="h-3 w-3" aria-hidden />
                                  Day off
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {timeBlocks.map((block) => (
                        <tr key={block.start + block.end} className="align-top">
                          <th scope="row" className="whitespace-nowrap px-3 py-3 font-mono text-caption font-medium text-on-surface-variant">
                            {block.start}
                            <span className="block text-on-surface-variant">{block.end}</span>
                          </th>
                          {data.days.map((day) => {
                            const here = data.sessions.filter(
                              (session) =>
                                session.dayOfWeek === day &&
                                session.startTime === block.start &&
                                session.endTime === block.end
                            );
                            return (
                              <td
                                key={day}
                                className={`px-1.5 py-1.5 ${data.daysOff.includes(day) ? 'bg-surface-container-lowest' : ''}`}
                              >
                                {here.map((session) => (
                                  <SessionCard key={session.id} session={session} />
                                ))}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {data.daysOff.length > 0 && (
                <p className="flex items-center gap-1.5 text-body text-on-surface-variant">
                  <Coffee className="h-4 w-4 text-warning" aria-hidden />
                  Days off: <span className="font-medium text-on-surface">{data.daysOff.join(', ')}</span>
                </p>
              )}

              <section>
                <h2 className="mb-3 text-body font-semibold uppercase tracking-eyebrow text-on-surface">All sessions</h2>
                <Card tone="raised" className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[48rem] text-left text-body">
                      <caption className="sr-only">Every session in this schedule</caption>
                      <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">Course</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Day</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Time</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Room</th>
                          <th scope="col" className="px-4 py-3 font-semibold">Instructor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {data.sessions.map((session) => (
                          <tr key={session.id} className="hover:bg-surface-container">
                            <td className="px-4 py-3">
                              <span className="font-mono text-caption text-on-surface">{session.courseCode}</span>
                              <span className="block text-on-surface">{session.courseName}</span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={TYPE_STYLE[session.slotType].tone}>
                                {session.slotType} · G{session.groupNumber}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-on-surface">{session.dayOfWeek}</td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-caption text-on-surface">
                              {session.startTime}–{session.endTime}
                            </td>
                            <td className="px-4 py-3 text-on-surface">{session.room}</td>
                            <td className="px-4 py-3 text-on-surface-variant">{session.instructor ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>
            </>
          )}
        </div>
      ) : null}
    </>
  );
};

const SessionCard: React.FC<{ session: ScheduleSession }> = ({ session }) => (
  <div className={`mb-1 rounded-lg border p-2 last:mb-0 ${TYPE_STYLE[session.slotType].card}`}>
    <p className="flex items-center justify-between gap-1">
      <span className="whitespace-nowrap font-mono text-caption font-semibold text-on-surface">{session.courseCode}</span>
      <span className="truncate text-caption uppercase tracking-eyebrow text-on-surface">{session.slotType}</span>
    </p>
    <p className="mt-0.5 truncate text-caption text-on-surface" title={session.courseName}>
      {session.courseName}
    </p>
    <p className="mt-1 flex items-center gap-1 text-caption text-on-surface">
      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
      {session.room} · G{session.groupNumber}
    </p>
    <p className="flex items-center gap-1 text-caption text-on-surface">
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      {session.startTime}–{session.endTime}
    </p>
    {session.instructor && (
      <p className="flex items-center gap-1 truncate text-caption text-on-surface-variant">
        <UserRound className="h-3 w-3 shrink-0" aria-hidden />
        {session.instructor}
      </p>
    )}
  </div>
);

export default WeeklySchedulePage;
