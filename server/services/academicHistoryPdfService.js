const PDFDocument = require('pdfkit');

const MARGIN = 50;
const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const MUTED = '#555555';
const RULE = '#cccccc';
const HEADER_FILL = '#eeeeee';

/** "2025/2026 Spring" sorts after "2025/2026 Winter", as on the page. */
const termOrder = (term) => {
  const [years = '', season] = String(term).split(' ');
  return Number(years.split('/')[0]) * 10 + (season === 'Spring' ? 5 : season === 'Summer' ? 7 : 0);
};

const bottomLimit = (doc) => doc.page.height - doc.page.margins.bottom;

const ensureSpace = (doc, height) => {
  if (doc.y + height > bottomLimit(doc)) doc.addPage();
};

const sectionTitle = (doc, title, note) => {
  ensureSpace(doc, 60);
  doc.moveDown(0.8).font(BOLD).fontSize(13).fillColor('black').text(title, MARGIN);
  if (note) doc.font(FONT).fontSize(9).fillColor(MUTED).text(note, MARGIN);
  doc.moveDown(0.4);
};

const emptyNote = (doc, text) => {
  doc.font(FONT).fontSize(10).fillColor(MUTED).text(text, MARGIN);
};

/**
 * Draws a table with wrapping cells. A row that does not fit moves to a new
 * page, and the header row is repeated there so every page is readable alone.
 */
const table = (doc, columns, rows) => {
  const padding = 4;
  const lineHeight = (cells, font) => {
    doc.font(font).fontSize(9);
    return Math.max(
      ...cells.map((cell, i) =>
        doc.heightOfString(String(cell), { width: columns[i].width - padding * 2, align: columns[i].align })
      )
    ) + padding * 2;
  };

  const drawRow = (cells, { header = false } = {}) => {
    const font = header ? BOLD : FONT;
    const height = lineHeight(cells, font);
    const top = doc.y;
    const width = columns.reduce((sum, column) => sum + column.width, 0);
    if (header) doc.rect(MARGIN, top, width, height).fill(HEADER_FILL);

    let x = MARGIN;
    cells.forEach((cell, i) => {
      doc
        .font(font)
        .fontSize(9)
        .fillColor('black')
        .text(String(cell), x + padding, top + padding, {
          width: columns[i].width - padding * 2,
          align: columns[i].align ?? 'left',
        });
      x += columns[i].width;
    });

    doc.moveTo(MARGIN, top + height).lineTo(MARGIN + width, top + height).strokeColor(RULE).lineWidth(0.5).stroke();
    doc.x = MARGIN;
    doc.y = top + height;
    return height;
  };

  const headers = columns.map((column) => column.label);
  const headerHeight = lineHeight(headers, BOLD);
  ensureSpace(doc, headerHeight * 2);
  drawRow(headers, { header: true });

  rows.forEach((cells) => {
    if (doc.y + lineHeight(cells, FONT) > bottomLimit(doc)) {
      doc.addPage();
      drawRow(headers, { header: true });
    }
    drawRow(cells);
  });
};

const studentDetails = (doc, student, summary) => {
  const facts = [
    ['Student ID', student.studentId],
    ['Email', student.email],
    ['Major', student.major],
    ['Advisor', student.assignedAdvisor ? student.assignedAdvisor.fullName : 'Not assigned'],
    ['Current semester', `Semester ${student.currentSemester}`],
    ['Academic standing', student.academicStanding],
    ['GPA', summary.gpa !== null && summary.gpa !== undefined ? summary.gpa.toFixed(2) : 'No grades yet'],
    ['Completed hours', String(summary.completedHours)],
  ];

  const columnWidth = (doc.page.width - MARGIN * 2) / 2;
  const top = doc.y;
  facts.forEach(([label, value], index) => {
    const x = MARGIN + (index % 2) * columnWidth;
    const y = top + Math.floor(index / 2) * 30;
    doc.font(FONT).fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { width: columnWidth - 10 });
    doc.font(BOLD).fontSize(10).fillColor('black').text(value, x, y + 10, { width: columnWidth - 10 });
  });
  doc.x = MARGIN;
  doc.y = top + Math.ceil(facts.length / 2) * 30;
  doc
    .font(FONT)
    .fontSize(8)
    .fillColor(MUTED)
    .text('GPA uses the GUC scale, where 0.7 is the best grade and 5.0 is a fail.', MARGIN);
};

const completedSection = (doc, completed) => {
  sectionTitle(doc, `Completed courses (${completed.length})`);
  if (completed.length === 0) {
    emptyNote(doc, 'No completed courses yet.');
    return;
  }

  const byTerm = new Map();
  completed.forEach((row) => byTerm.set(row.term, [...(byTerm.get(row.term) ?? []), row]));
  const groups = [...byTerm.entries()].sort(([a], [b]) => termOrder(b) - termOrder(a));

  groups.forEach(([term, rows]) => {
    ensureSpace(doc, 70);
    doc.moveDown(0.3).font(BOLD).fontSize(10).fillColor('black').text(`${term} · Semester ${rows[0].semester}`, MARGIN);
    doc.moveDown(0.2);
    table(
      doc,
      [
        { label: 'Code', width: 80 },
        { label: 'Course', width: 255 },
        { label: 'Credit hrs', width: 70, align: 'right' },
        { label: 'Grade', width: 90, align: 'right' },
      ],
      rows.map((row) => [
        row.course.code,
        row.course.name,
        row.course.creditHours,
        `${row.grade} · ${Number(row.gradePoints).toFixed(1)}`,
      ])
    );
  });
};

const currentSection = (doc, current, summary, currentSemester) => {
  const note = current[0] ? `${current[0].term} · ${summary.currentHours} credit hours` : undefined;
  sectionTitle(doc, `Current courses (${current.length})`, note);
  if (current.length === 0) {
    emptyNote(
      doc,
      currentSemester === 8
        ? 'Semester 8 is the bachelor project, so there are no regular courses this term.'
        : 'No courses are registered for the current term.'
    );
    return;
  }
  table(
    doc,
    [
      { label: 'Code', width: 80 },
      { label: 'Course', width: 345 },
      { label: 'Credit hrs', width: 70, align: 'right' },
    ],
    current.map((row) => [row.course.code, row.course.name, row.course.creditHours])
  );
};

const remainingSection = (doc, remaining, summary) => {
  sectionTitle(
    doc,
    `Remaining courses (${remaining.length})`,
    `${summary.remainingHours} credit hours · electives are chosen later and not listed`
  );
  if (remaining.length === 0) {
    emptyNote(doc, 'Every required course of this major is completed or in progress.');
    return;
  }
  table(
    doc,
    [
      { label: 'Code', width: 65 },
      { label: 'Course', width: 150 },
      { label: 'Credit hrs', width: 50, align: 'right' },
      { label: 'Prerequisites', width: 125 },
      { label: 'Offered in', width: 75 },
      { label: 'Sem.', width: 30, align: 'right' },
    ],
    remaining.map((course) => {
      const tags = [course.isRetake && 'Retake', course.courseType === 'Huma' && 'Huma'].filter(Boolean);
      return [
        course.code,
        tags.length ? `${course.name} (${tags.join(', ')})` : course.name,
        course.creditHours,
        course.prerequisites.length === 0
          ? 'None'
          : course.prerequisites
              .map((prerequisite) => `${prerequisite.code}${prerequisite.passed ? ' (passed)' : ''}`)
              .join(', '),
        (course.offeringSeasons ?? []).join(', '),
        course.recommendedSemester,
      ];
    })
  );
};

/**
 * Req 56: the req 54 academic history as a PDF.
 *
 * Takes the exact payload the Academic History page renders (serialized
 * student plus buildAcademicHistory output), so the download always matches
 * what is on screen. Resolves to a Buffer rather than streaming into the
 * response, so a rendering failure can still be answered with a JSON error.
 */
const renderAcademicHistoryPdf = ({ student, summary, completed, current, remaining }, generatedAt = new Date()) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: { Title: `Academic History - ${student.fullName}`, Subject: 'Academic history' },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.font(BOLD).fontSize(18).fillColor('black').text('Academic History', MARGIN);
      doc.font(BOLD).fontSize(13).text(student.fullName);
      doc
        .font(FONT)
        .fontSize(8)
        .fillColor(MUTED)
        .text(`Generated ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
      doc.moveDown(0.8);

      studentDetails(doc, student, summary);
      completedSection(doc, completed);
      currentSection(doc, current, summary, student.currentSemester);
      remainingSection(doc, remaining, summary);

      // Page numbers go in the bottom margin; lifting the margin while writing
      // them stops pdfkit from treating the footer as overflow.
      const { start, count } = doc.bufferedPageRange();
      for (let i = start; i < start + count; i += 1) {
        doc.switchToPage(i);
        const { bottom } = doc.page.margins;
        doc.page.margins.bottom = 0;
        doc
          .font(FONT)
          .fontSize(8)
          .fillColor(MUTED)
          .text(`${student.fullName} · ${student.studentId} · Page ${i + 1} of ${count}`, MARGIN, doc.page.height - 35, {
            width: doc.page.width - MARGIN * 2,
            align: 'center',
          });
        doc.page.margins.bottom = bottom;
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });

module.exports = { renderAcademicHistoryPdf };
