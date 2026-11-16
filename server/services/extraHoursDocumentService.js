const Request = require('../models/ExtraHoursRequest');
const Payment = require('../models/ExtraHoursPayment');
const Charge = require('../models/DeferredExtraHoursCharge');
const PDFDocument = require('pdfkit');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
async function getDocument(requestId, studentId) {
  const row = await Request.findOne({ _id: requestId, student: studentId, decision: 'Approved' }).populate('student', 'fullName studentId').populate('term', 'academicYear season').lean();
  if (!row) throw fail('Extra-hours request not found.', 404);
  const common = { requestReference: row.reference, student: { name: row.student.fullName, studentId: row.student.studentId },
    term: row.term ? `${row.term.academicYear} ${row.term.season}` : 'Term unavailable', currency: row.currency,
    items: row.items.map((item) => ({ code: item.code, name: item.name, creditHours: item.creditHours, requestedHours: item.requestedHours, ratePerHour: item.ratePerHour, subtotal: item.subtotal })), totalCost: row.totalCost };
  if (row.settlementStatus === 'Paid') {
    const payment = await Payment.findOne({ request: row._id, student: studentId, status: 'Succeeded' }).lean();
    if (!payment?.paidAt || payment.amount !== row.totalCost || payment.currency !== row.currency || payment.reference !== row.paymentReference) throw fail('A verified paid record is not available for this request.');
    if (payment.method === 'Gateway' && !payment.stripePaymentIntent) throw fail('The gateway transaction reference is not available.');
    return { ...common, kind: 'Paid', title: 'Extra-hours payment receipt', reference: payment.reference, date: payment.paidAt,
      paymentMethod: payment.method === 'Gateway' ? 'Stripe (sandbox)' : 'Wallet', transactionReference: payment.stripePaymentIntent || payment.reference,
      notice: payment.method === 'Gateway' ? 'Stripe sandbox test payment. No real card payment was taken.' : 'Payment received from the student wallet.' };
  }
  if (row.settlementStatus === 'Deferred to Next Installment') {
    const charge = await Charge.findOne({ _id: row.deferredCharge, request: row._id, student: studentId, status: { $in: ['Outstanding', 'Paid'] } }).lean();
    if (!charge || charge.amount !== row.totalCost || charge.currency !== row.currency) throw fail('A confirmed deferred charge is not available for this request.');
    return { ...common, kind: 'Deferred', title: 'Deferred-payment confirmation', reference: charge.reference, date: charge.confirmedAt,
      installment: { reference: charge.installmentReference, label: charge.installmentLabel, dueDate: charge.dueDate },
      amountDue: charge.status === 'Paid' ? 0 : charge.amount, chargeStatus: charge.status,
      notice: 'This confirms a charge added to a university installment. It is not a paid receipt or proof of payment. Amount due refers to this extra-hours charge, not the full tuition installment.' };
  }
  throw fail('A document is available only after successful payment or confirmed installment deferral.');
}
function renderDocument(document) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: document.title, Author: 'University Schedule Management System' } });
    const chunks = []; pdf.on('data', (chunk) => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject);
    const amount = (value) => `EGP ${Number(value).toFixed(2)}`;
    const line = (label, value) => { pdf.font('Helvetica').fontSize(10).fillColor('#243247').text(`${label}: ${value}`); pdf.moveDown(0.4); };
    pdf.font('Helvetica-Bold').fontSize(20).fillColor('#14213d').text(document.title); pdf.moveDown();
    line('Reference', document.reference); line('Request', document.requestReference);
    line('Student', `${document.student.name} (${document.student.studentId})`); line('Academic term', document.term);
    line(document.kind === 'Paid' ? 'Payment date (UTC)' : 'Confirmation date (UTC)', new Date(document.date).toISOString());
    if (document.kind === 'Paid') { line('Payment method', document.paymentMethod); line('Transaction reference', document.transactionReference); }
    else { line('Installment', document.installment.label); line('Installment reference', document.installment.reference); line('Installment due date', new Date(document.installment.dueDate).toISOString().slice(0, 10)); line('Charge status', document.chargeStatus); line('Extra-hours amount due', amount(document.amountDue)); }
    pdf.moveDown(); pdf.font('Helvetica-Bold').fontSize(12).text('Courses and itemized cost'); pdf.moveDown(0.5);
    for (const item of document.items) {
      if (pdf.y > 650) pdf.addPage();
      pdf.font('Helvetica-Bold').fontSize(10).text(`${item.code} - ${item.name}`);
      pdf.font('Helvetica').text(`Course credits: ${item.creditHours} | Extra hours: ${item.requestedHours}`);
      pdf.text(`Rate: ${amount(item.ratePerHour)}/hour | Subtotal: ${amount(item.subtotal)}`); pdf.moveDown(0.7);
    }
    if (pdf.y > 620) pdf.addPage();
    pdf.font('Helvetica-Bold').fontSize(13).text(`Total ${document.kind === 'Paid' ? 'paid' : 'deferred'}: ${amount(document.totalCost)}`);
    pdf.moveDown(); pdf.font('Helvetica').fontSize(10).text(document.notice);
    pdf.end();
  });
}
module.exports = { getDocument, renderDocument };
