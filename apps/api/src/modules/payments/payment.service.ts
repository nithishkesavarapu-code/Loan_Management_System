import mongoose, { type HydratedDocument, type InferSchemaType } from 'mongoose';
import { indiaDate, pageOffset, paymentSchema, type CollectionLoanListQuery, type LoanDetail, type LoanSummary, type Page, type PaymentDTO, type PaymentListQuery, type RecordPayment, type RecordPaymentResult, type Role } from '@lms/shared';
import { HttpError } from '../../middleware/errors.js';
import { objectId, ownedLoan } from '../../middleware/ownership.js';
import { Loan, type LoanDocument } from '../loans/loan.model.js';
import { loanDetail, loanSummary } from '../loans/loan.service.js';
import { Payment } from './payment.model.js';

const collectionStatuses = ['DISBURSED', 'CLOSED'] as const;
type PaymentDocument = HydratedDocument<InferSchemaType<typeof Payment.schema>>;

function paymentDto(record: PaymentDocument): PaymentDTO {
  return paymentSchema.parse({
    id: record.id, loanId: record.loanId.toHexString(), utr: record.utrNormalized,
    amountPaise: record.amountPaise, paymentDate: record.paymentDate,
    recordedBy: record.recordedBy.toHexString(), createdAt: record.createdAt.toISOString(),
  });
}

function nameOrEmailFilter(q?: string) {
  if (!q) return {};
  const needle = q.toLocaleLowerCase('en-US');
  return { $expr: { $or: ['applicantSnapshot.fullName', 'applicantSnapshot.email'].map((field) => ({
    $gte: [{ $indexOfCP: [{ $toLower: `$${field}` }, { $literal: needle }] }, 0],
  })) } };
}

export async function listCollectionLoans(query: CollectionLoanListQuery): Promise<Page<LoanSummary>> {
  const statuses = query.status === 'ALL' ? collectionStatuses : [query.status];
  const filter = { status: { $in: statuses }, ...nameOrEmailFilter(query.q) };
  const [records, total] = await Promise.all([
    Loan.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit),
    Loan.countDocuments(filter),
  ]);
  return { data: records.map(loanSummary), pagination: { page: query.page, limit: query.limit, total } };
}

export async function getCollectionLoan(id: string): Promise<LoanDetail> {
  const loan = await Loan.findOne({ _id: objectId(id), status: { $in: collectionStatuses } });
  if (!loan) throw new HttpError(404, 'NOT_FOUND', 'The requested loan was not found.');
  return loanDetail(loan);
}

async function paymentPage(loanId: string, query: PaymentListQuery): Promise<Page<PaymentDTO>> {
  const filter = { loanId: objectId(loanId) };
  const [records, total] = await Promise.all([
    Payment.find(filter).sort({ paymentDate: -1, createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit),
    Payment.countDocuments(filter),
  ]);
  return { data: records.map(paymentDto), pagination: { page: query.page, limit: query.limit, total } };
}

export async function listBorrowerPayments(id: string, borrowerId: string, query: PaymentListQuery) {
  await ownedLoan(id, borrowerId);
  return paymentPage(id, query);
}

export async function listCollectionPayments(id: string, query: PaymentListQuery) {
  await getCollectionLoan(id);
  return paymentPage(id, query);
}

function paymentDateIsValid(loan: LoanDocument, paymentDate: string, now: Date) {
  const disbursedDate = loan.disbursedAt && indiaDate(loan.disbursedAt);
  return !!disbursedDate && paymentDate >= disbursedDate && paymentDate <= indiaDate(now);
}

function duplicateUtr(): HttpError {
  return new HttpError(409, 'UTR_ALREADY_EXISTS', 'This UTR has already been recorded.');
}

export async function recordPayment(id: string, actor: { id: string; role: Role }, input: RecordPayment, now = new Date()): Promise<RecordPaymentResult> {
  const loanId = objectId(id);
  try {
    return await mongoose.connection.transaction(async (session) => {
      const loan = await Loan.findOne({ _id: loanId, status: { $in: collectionStatuses } }).session(session);
      if (!loan) throw new HttpError(404, 'NOT_FOUND', 'The requested loan was not found.');

      const duplicate = await Payment.exists({ utrNormalized: input.utr }).session(session);
      if (duplicate) throw duplicateUtr();
      if (loan.status !== 'DISBURSED') throw new HttpError(409, 'INVALID_LOAN_STATE', 'Closed loans cannot accept payments.');
      if (!paymentDateIsValid(loan, input.paymentDate, now)) {
        throw new HttpError(422, 'PAYMENT_DATE_INVALID', 'Use a date from disbursement through today.');
      }
      const outstanding = loan.totalRepaymentPaise - loan.totalPaidPaise;
      if (input.amountPaise > outstanding) {
        throw new HttpError(422, 'PAYMENT_EXCEEDS_OUTSTANDING', 'The payment cannot exceed the outstanding balance.');
      }

      const finalPayment = input.amountPaise === outstanding;
      const payment = new Payment({ loanId: loan._id, utrNormalized: input.utr, amountPaise: input.amountPaise, paymentDate: input.paymentDate, recordedBy: objectId(actor.id) });
      await payment.save({ session });

      const update = finalPayment
        ? {
          $inc: { totalPaidPaise: input.amountPaise },
          $set: { status: 'CLOSED', closedAt: now },
          $push: { statusHistory: { fromStatus: 'DISBURSED', toStatus: 'CLOSED', actorId: objectId(actor.id), actorRole: actor.role, occurredAt: now, reason: null } },
        }
        : { $inc: { totalPaidPaise: input.amountPaise } };
      const updated = await Loan.findOneAndUpdate({
        _id: loan._id, status: 'DISBURSED', totalPaidPaise: loan.totalPaidPaise,
        $expr: { $lte: [{ $add: ['$totalPaidPaise', input.amountPaise] }, '$totalRepaymentPaise'] },
      }, update, { returnDocument: 'after', session, runValidators: true });
      if (!updated) throw new HttpError(409, 'INVALID_LOAN_STATE', 'The loan changed while recording this payment. Refresh and try again.');
      return { payment: paymentDto(payment), loan: loanDetail(updated) };
    }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoError && error.hasErrorLabel('UnknownTransactionCommitResult')) {
      throw new HttpError(503, 'PAYMENT_UNCONFIRMED', 'Payment could not be confirmed. Refresh history before retrying with the same UTR.');
    }
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000 && error.keyPattern?.utrNormalized) throw duplicateUtr();
    throw error;
  }
}
