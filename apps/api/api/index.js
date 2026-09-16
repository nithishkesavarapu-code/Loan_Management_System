// apps/api/src/app.ts
import express from "express";
import { createRequire } from "node:module";
import cookieParser from "cookie-parser";
import { z as z15 } from "zod";

// apps/api/src/config/database.ts
import mongoose from "mongoose";
mongoose.set("bufferCommands", false);
async function connectDatabase(env2) {
  await mongoose.connect(env2.MONGODB_URI, {
    serverSelectionTimeoutMS: env2.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: env2.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    maxPoolSize: 10,
    autoIndex: env2.NODE_ENV !== "production"
  });
  await assertDatabaseReady();
}
async function assertDatabaseReady() {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) throw new Error("Database is disconnected.");
  const topology = await db.admin().command({ hello: 1 }, { timeoutMS: 2e3 });
  const supportsTransactions = typeof topology.setName === "string" || topology.msg === "isdbgrid";
  if (!supportsTransactions || topology.logicalSessionTimeoutMinutes == null || !topology.isWritablePrimary) {
    throw new Error("A writable MongoDB replica set or sharded cluster is required.");
  }
}

// apps/api/src/middleware/errors.ts
import { ZodError } from "zod";
var HttpError = class extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "HttpError";
  }
  status;
  code;
  details;
};
var notFound = (_req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", "The requested resource was not found."));
};
var errorHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    _next(error);
    return;
  }
  let status = 500;
  let body = { error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." } };
  if (error instanceof HttpError) {
    status = error.status;
    body = { error: { code: error.code, message: error.message, ...error.details } };
  } else if (error instanceof ZodError) {
    status = 422;
    const fields = {};
    for (const issue of error.issues) {
      const field = issue.path.join(".") || "request";
      (fields[field] ??= []).push(issue.message);
    }
    body = { error: { code: "VALIDATION_FAILED", message: "Request validation failed.", fields } };
  } else if (typeof error === "object" && error !== null && "type" in error) {
    if (error.type === "entity.parse.failed") {
      status = 400;
      body = { error: { code: "MALFORMED_REQUEST", message: "The request contains invalid JSON." } };
    } else if (error.type === "entity.too.large") {
      status = 413;
      body = { error: { code: "REQUEST_TOO_LARGE", message: "The request body is too large." } };
    }
  }
  if (status === 500) console.error("Unexpected API error; request failed.");
  res.status(status).json(body);
};

// packages/shared/dist/index.js
import { z as z6 } from "zod";

// packages/shared/dist/constants.js
var roles = ["ADMIN", "SALES", "SANCTION", "DISBURSEMENT", "COLLECTION", "BORROWER"];
var employmentModes = ["SALARIED", "SELF_EMPLOYED", "UNEMPLOYED"];
var applicationStates = ["DRAFT", "SUBMITTED"];
var loanStatuses = ["APPLIED", "SANCTIONED", "REJECTED", "DISBURSED", "CLOSED"];

// packages/shared/dist/auth.js
import { z } from "zod";
var SESSION_COOKIE = "lms_session";
var emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
var passwordSchema = z.string().refine((value) => Array.from(value).length >= 8, "Use at least 8 characters.").refine((value) => new TextEncoder().encode(value).length <= 72, "Use at most 72 UTF-8 bytes.");
var authRequestSchema = z.strictObject({ email: emailSchema, password: passwordSchema });
var userSchema = z.strictObject({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  email: emailSchema,
  role: z.enum(roles),
  createdAt: z.iso.datetime()
});
var authResponseSchema = z.strictObject({ data: userSchema });
var dashboardModules = ["sales", "sanction", "disbursement", "collection"];
var moduleRoles = {
  sales: ["SALES", "ADMIN"],
  sanction: ["SANCTION", "ADMIN"],
  disbursement: ["DISBURSEMENT", "ADMIN"],
  collection: ["COLLECTION", "ADMIN"]
};

// packages/shared/dist/dates.js
function isDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function indiaDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (name) => parts.find((value) => value.type === name).value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
function completedAge(dob, today) {
  if (!isDateOnly(dob) || !isDateOnly(today) || dob > today)
    throw new RangeError("Invalid date of birth or evaluation date.");
  const year = Number(today.slice(0, 4));
  let birthday = dob.slice(5);
  if (birthday === "02-29" && !isDateOnly(`${today.slice(0, 4)}-02-29`))
    birthday = "03-01";
  return year - Number(dob.slice(0, 4)) - (today.slice(5) < birthday ? 1 : 0);
}

// packages/shared/dist/applications.js
import { z as z2 } from "zod";
var objectIdSchema = z2.string().regex(/^[a-f\d]{24}$/i);
var dateOnlySchema = z2.string().refine(isDateOnly, "Enter a real date in YYYY-MM-DD format.");
var personalFieldNames = ["fullName", "pan", "dob", "monthlySalaryPaise", "employmentMode"];
var personalFieldLabels = {
  fullName: "Full name",
  pan: "PAN",
  dob: "Date of birth",
  monthlySalaryPaise: "Monthly salary",
  employmentMode: "Employment mode"
};
var personalFieldSchemas = {
  fullName: z2.string().trim().refine((value) => Array.from(value).length >= 2 && Array.from(value).length <= 120, "Use 2-120 characters."),
  pan: z2.string().trim().toUpperCase().max(32, "Use at most 32 characters."),
  dob: dateOnlySchema,
  monthlySalaryPaise: z2.number().int().nonnegative(),
  employmentMode: z2.enum(employmentModes)
};
var personalDetailsDraftSchema = z2.strictObject({
  fullName: personalFieldSchemas.fullName.nullable(),
  pan: personalFieldSchemas.pan.nullable(),
  dob: personalFieldSchemas.dob.nullable(),
  monthlySalaryPaise: personalFieldSchemas.monthlySalaryPaise.nullable(),
  employmentMode: personalFieldSchemas.employmentMode.nullable()
});
var eligibilityResultSchema = z2.strictObject({
  eligible: z2.boolean(),
  evaluatedAt: z2.iso.datetime(),
  ageYears: z2.number().int().nonnegative().nullable(),
  failures: z2.array(z2.strictObject({
    field: z2.enum(personalFieldNames),
    code: z2.enum(["REQUIRED", "INVALID_FORMAT", "PAN_INVALID", "AGE_OUT_OF_RANGE", "SALARY_TOO_LOW", "EMPLOYMENT_INELIGIBLE"]),
    message: z2.string()
  }))
});
var applicationSteps = ["PERSONAL_DETAILS", "SALARY_SLIP", "LOAN_CONFIGURATION", "SUBMITTED"];
var loanLimits = { minPrincipalPaise: 5e6, maxPrincipalPaise: 5e7, minTenureDays: 30, maxTenureDays: 365, annualRatePercent: 12 };
var loanConfigurationSchema = z2.strictObject({
  principalPaise: z2.number().int().min(loanLimits.minPrincipalPaise).max(loanLimits.maxPrincipalPaise),
  tenureDays: z2.number().int().min(loanLimits.minTenureDays).max(loanLimits.maxTenureDays)
});
function updateApplicationSchema(now) {
  const personal = personalDetailsDraftSchema.extend({
    dob: dateOnlySchema.refine((value) => value <= indiaDate(now), "Date of birth cannot be in the future.").nullable()
  }).partial();
  return z2.strictObject({ personalDetails: personal.optional(), loanConfig: loanConfigurationSchema.partial().optional() }).refine((value) => Object.keys(value.personalDetails ?? {}).length + Object.keys(value.loanConfig ?? {}).length > 0, "Provide at least one field to update.");
}
var salarySlipMaxBytes = 5e6;
var salarySlipMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
var salarySlipExtensions = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"]
};
var documentSchema = z2.strictObject({
  id: objectIdSchema,
  originalName: z2.string(),
  mimeType: z2.enum(["application/pdf", "image/jpeg", "image/png"]),
  sizeBytes: z2.number().int().min(1).max(salarySlipMaxBytes),
  createdAt: z2.iso.datetime()
});
var documentResponseSchema = z2.strictObject({ data: documentSchema });
var applicationSchema = z2.strictObject({
  id: objectIdSchema,
  borrowerId: objectIdSchema,
  state: z2.enum(applicationStates),
  personalDetails: personalDetailsDraftSchema,
  loanConfig: loanConfigurationSchema,
  salarySlip: documentSchema.nullable(),
  eligibility: eligibilityResultSchema,
  nextStep: z2.enum(applicationSteps),
  loanId: objectIdSchema.nullable(),
  submittedAt: z2.iso.datetime().nullable(),
  createdAt: z2.iso.datetime(),
  updatedAt: z2.iso.datetime()
});
var applicationResponseSchema = z2.strictObject({ data: applicationSchema });
var eligibilityResponseSchema = z2.strictObject({ data: eligibilityResultSchema });
function applicationNextStep(eligible, hasSlip, state) {
  if (state === "SUBMITTED")
    return "SUBMITTED";
  return !eligible ? "PERSONAL_DETAILS" : hasSlip ? "LOAN_CONFIGURATION" : "SALARY_SLIP";
}

// packages/shared/dist/pagination.js
import { z as z3 } from "zod";
var queryInteger = z3.string().regex(/^\d+$/, "Use a positive integer.").transform(Number).pipe(z3.number().int().positive());
var paginationQueryFields = { page: queryInteger.default(1), limit: queryInteger.pipe(z3.number().max(100)).default(20) };
var applicationListQuerySchema = z3.strictObject({ ...paginationQueryFields, state: z3.enum(applicationStates).optional() });
var salesListQuerySchema = z3.strictObject({ ...paginationQueryFields, q: z3.string().trim().min(1).max(100).optional() });
function pageSchema(item) {
  return z3.strictObject({ data: z3.array(item), pagination: z3.strictObject({ page: z3.number().int().positive(), limit: z3.number().int().min(1).max(100), total: z3.number().int().nonnegative() }) });
}
var applicationPageSchema = pageSchema(applicationSchema);
function pageOffset({ page, limit }) {
  const offset = BigInt(page - 1) * BigInt(limit);
  return Number(offset > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : offset);
}

// packages/shared/dist/sales.js
import { z as z4 } from "zod";
var leadSummarySchema = z4.strictObject({
  borrowerId: objectIdSchema,
  email: z4.email(),
  fullName: z4.string().nullable(),
  registeredAt: z4.iso.datetime(),
  draftId: objectIdSchema.nullable(),
  nextStep: z4.enum(["PERSONAL_DETAILS", "SALARY_SLIP", "LOAN_CONFIGURATION"]),
  eligible: z4.boolean().nullable()
});
var leadDetailSchema = leadSummarySchema.extend({
  employmentMode: z4.enum(employmentModes).nullable(),
  eligibility: eligibilityResultSchema.nullable(),
  draftUpdatedAt: z4.iso.datetime().nullable()
});
var leadPageSchema = pageSchema(leadSummarySchema);
var leadResponseSchema = z4.strictObject({ data: leadDetailSchema });

// packages/shared/dist/loans.js
import { z as z5 } from "zod";
function calculateLoan(input) {
  const terms = loanConfigurationSchema.parse(input);
  const numerator = BigInt(terms.principalPaise) * BigInt(loanLimits.annualRatePercent) * BigInt(terms.tenureDays);
  const interestPaise = Number((numerator + 18250n) / 36500n);
  return { ...terms, annualRatePercent: loanLimits.annualRatePercent, interestPaise, totalRepaymentPaise: terms.principalPaise + interestPaise };
}
var paise = z5.number().int().nonnegative();
var loanSummarySchema = z5.strictObject({
  id: objectIdSchema,
  applicationId: objectIdSchema,
  borrower: z5.strictObject({ id: objectIdSchema, fullName: z5.string(), email: z5.email() }),
  status: z5.enum(loanStatuses),
  ...loanConfigurationSchema.shape,
  annualRatePercent: z5.literal(12),
  interestPaise: paise,
  totalRepaymentPaise: paise,
  totalPaidPaise: paise,
  outstandingPaise: paise,
  createdAt: z5.iso.datetime()
});
var statusEventSchema = z5.strictObject({
  fromStatus: z5.enum(loanStatuses).nullable(),
  toStatus: z5.enum(loanStatuses),
  actorId: objectIdSchema,
  actorRole: z5.enum(roles),
  occurredAt: z5.iso.datetime(),
  reason: z5.string().nullable()
});
var loanDetailSchema = loanSummarySchema.extend({
  rejectionReason: z5.string().nullable(),
  sanctionedAt: z5.iso.datetime().nullable(),
  disbursedAt: z5.iso.datetime().nullable(),
  closedAt: z5.iso.datetime().nullable(),
  updatedAt: z5.iso.datetime(),
  statusHistory: z5.array(statusEventSchema)
});
var reviewedLoanDetailSchema = loanDetailSchema.extend({
  applicantSnapshot: z5.strictObject({ ...personalFieldSchemas, email: z5.email() }),
  eligibilityAtSubmission: eligibilityResultSchema,
  salarySlip: documentSchema
});
var loanDetailResponseSchema = z5.strictObject({ data: loanDetailSchema });
var reviewedLoanResponseSchema = z5.strictObject({ data: reviewedLoanDetailSchema });
var borrowerLoanListQuerySchema = z5.strictObject({ ...paginationQueryFields, status: z5.enum(["ALL", ...loanStatuses]).default("ALL") });
var loanPageSchema = pageSchema(loanSummarySchema);
var executiveLoanQueryFields = { ...paginationQueryFields, q: z5.string().trim().min(1).max(100).optional() };
var sanctionLoanListQuerySchema = z5.strictObject({ ...executiveLoanQueryFields, status: z5.enum(["ALL", ...loanStatuses]).default("APPLIED") });
var disbursementLoanListQuerySchema = z5.strictObject({ ...executiveLoanQueryFields, status: z5.enum(["ALL", "SANCTIONED", "DISBURSED", "CLOSED"]).default("SANCTIONED") });
var collectionLoanListQuerySchema = z5.strictObject({ ...executiveLoanQueryFields, status: z5.enum(["ALL", "DISBURSED", "CLOSED"]).default("DISBURSED") });
var sanctionLoanPageSchema = pageSchema(loanSummarySchema);
var disbursementLoanPageSchema = pageSchema(loanSummarySchema);
var collectionLoanPageSchema = pageSchema(loanSummarySchema);
var sanctionDecisionSchema = z5.discriminatedUnion("decision", [
  z5.strictObject({ decision: z5.literal("APPROVE") }),
  z5.strictObject({ decision: z5.literal("REJECT"), reason: z5.string().trim().min(1, "Provide a rejection reason.").max(1e3) })
]);
var utrSchema = z5.string().trim().toUpperCase().min(1, "Enter a UTR.").max(100).regex(/^[A-Z0-9-]+$/, "Use only letters, numbers, and hyphens.");
var positivePaise = z5.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
var recordPaymentSchema = z5.strictObject({ utr: utrSchema, amountPaise: positivePaise, paymentDate: dateOnlySchema });
var paymentSchema = z5.strictObject({
  id: objectIdSchema,
  loanId: objectIdSchema,
  utr: utrSchema,
  amountPaise: positivePaise,
  paymentDate: dateOnlySchema,
  recordedBy: objectIdSchema,
  createdAt: z5.iso.datetime()
});
var paymentPageSchema = pageSchema(paymentSchema);
var paymentListQuerySchema = z5.strictObject({ ...paginationQueryFields });
var recordPaymentResultSchema = z5.strictObject({ payment: paymentSchema, loan: loanDetailSchema });
var recordPaymentResponseSchema = z5.strictObject({ data: recordPaymentResultSchema });

// packages/shared/dist/index.js
var healthResponseSchema = z6.strictObject({
  data: z6.strictObject({ status: z6.literal("ok"), database: z6.literal("connected") })
});

// apps/api/src/modules/auth/user.model.ts
import { model, Schema } from "mongoose";
var userSchema2 = new Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    validate: (value) => emailSchema.safeParse(value).success
  },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, required: true, default: "BORROWER" },
  seedKey: { type: String, select: false, immutable: true }
}, { timestamps: true, strict: "throw", collection: "users" });
userSchema2.index({ email: 1 }, { unique: true });
userSchema2.index({ seedKey: 1 }, { unique: true, sparse: true });
var User = model("User", userSchema2);

// apps/api/src/modules/auth/auth.service.ts
import bcrypt from "bcrypt";
var PASSWORD_COST = 12;
var DUMMY_HASH = "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
function toUserDTO(user) {
  return { id: user._id.toHexString(), email: user.email, role: user.role, createdAt: user.createdAt.toISOString() };
}
async function register(input) {
  const passwordHash = await bcrypt.hash(input.password, PASSWORD_COST);
  try {
    const user = await User.create({ email: input.email, passwordHash, role: "BORROWER" });
    return toUserDTO(user);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11e3) {
      throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "An account with this email already exists.");
    }
    throw error;
  }
}
async function login(input) {
  const user = await User.findOne({ email: input.email }).select("+passwordHash");
  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  return toUserDTO(user);
}

// apps/api/src/modules/auth/session.ts
import { jwtVerify, SignJWT } from "jose";
function cookieOptions(env2) {
  return { httpOnly: true, secure: env2.COOKIE_SECURE, sameSite: "lax", path: "/" };
}
async function createSession(userId, env2) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(userId).setIssuer("lms-api").setAudience("lms-web").setIssuedAt().setExpirationTime(`${env2.JWT_TTL_SECONDS}s`).sign(new TextEncoder().encode(env2.JWT_SECRET));
}
async function verifySession(token, env2) {
  try {
    if (typeof token !== "string") throw new Error("Missing session");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env2.JWT_SECRET), {
      algorithms: ["HS256"],
      issuer: "lms-api",
      audience: "lms-web",
      typ: "JWT",
      requiredClaims: ["sub", "iat", "exp"],
      maxTokenAge: env2.JWT_TTL_SECONDS
    });
    if (!payload.sub || !/^[a-f\d]{24}$/i.test(payload.sub) || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat || payload.exp - payload.iat > env2.JWT_TTL_SECONDS) {
      throw new Error("Invalid session claims");
    }
    return payload.sub;
  } catch {
    throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  }
}
async function setSession(res, userId, env2) {
  res.cookie(SESSION_COOKIE, await createSession(userId, env2), {
    ...cookieOptions(env2),
    maxAge: env2.JWT_TTL_SECONDS * 1e3
  });
}

// apps/api/src/middleware/auth.ts
function authenticate(env2) {
  return async (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const id = await verifySession(token, env2);
    const user = await User.findById(id);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
    req.currentUser = toUserDTO(user);
    next();
  };
}
function currentUser(req) {
  if (!req.currentUser) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  return req.currentUser;
}
function requireRoles(...roles2) {
  return (req, _res, next) => {
    if (!roles2.includes(currentUser(req).role)) throw new HttpError(403, "FORBIDDEN", "You do not have access to this area.");
    next();
  };
}
function protectMutations(env2) {
  return (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && (req.get("Origin") !== env2.WEB_ORIGIN || req.get("X-LMS-Request") !== "1")) {
      throw new HttpError(403, "CSRF_REJECTED", "The request origin or security header is invalid.");
    }
    next();
  };
}

// apps/api/src/modules/auth/auth.routes.ts
import { json, Router } from "express";
import { z as z7 } from "zod";
var requireJson = (req, _res, next) => {
  if (!req.is("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json for this request.");
  next();
};
function authRoutes(env2) {
  const router = Router();
  const parseJson = json({ limit: "100kb" });
  router.post("/register", requireJson, parseJson, async (req, res) => {
    z7.strictObject({}).parse(req.query);
    const user = await register(authRequestSchema.parse(req.body));
    await setSession(res, user.id, env2);
    res.status(201).json({ data: user });
  });
  router.post("/login", requireJson, parseJson, async (req, res) => {
    z7.strictObject({}).parse(req.query);
    const user = await login(authRequestSchema.parse(req.body));
    await setSession(res, user.id, env2);
    res.json({ data: user });
  });
  router.post("/logout", authenticate(env2), parseJson, (req, res) => {
    z7.strictObject({}).parse(req.query);
    if (req.headers["transfer-encoding"] || Number(req.headers["content-length"] ?? 0) > 0) {
      if (!req.is("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Use an empty body or an empty JSON object.");
    }
    z7.strictObject({}).parse(req.body ?? {});
    res.clearCookie(SESSION_COOKIE, cookieOptions(env2)).status(204).end();
  });
  router.get("/me", authenticate(env2), (req, res) => {
    z7.strictObject({}).parse(req.query);
    res.json({ data: currentUser(req) });
  });
  return router;
}

// apps/api/src/modules/applications/application.routes.ts
import { Router as Router2 } from "express";
import { z as z9 } from "zod";

// apps/api/src/middleware/requests.ts
import { z as z8 } from "zod";
function assertJsonContent(req) {
  const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || !!req.headers["transfer-encoding"];
  if (hasBody && !req.is("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json for this request.");
}
function emptyMutation(req) {
  assertJsonContent(req);
  z8.strictObject({}).parse(req.query);
  z8.strictObject({}).parse(req.body ?? {});
}
function noBody(req) {
  if (Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"]) {
    throw new HttpError(400, "MALFORMED_REQUEST", "This request does not accept a body.");
  }
}

// apps/api/src/modules/applications/application.model.ts
import { model as model2, Schema as Schema3 } from "mongoose";

// apps/api/src/models/fields.ts
import { Schema as Schema2 } from "mongoose";
var safeInteger = { validator: (value) => value === null || Number.isSafeInteger(value), message: "Must be a safe integer." };
var money = { type: Number, min: 0, max: Number.MAX_SAFE_INTEGER, validate: safeInteger };
var reference = (ref) => ({ type: Schema2.Types.ObjectId, ref, required: true });
var personalFields = {
  fullName: { type: String, trim: true, validate: {
    validator: (value) => value === null || Array.from(value).length >= 2 && Array.from(value).length <= 120,
    message: "Use 2-120 characters."
  }, default: null },
  pan: { type: String, trim: true, uppercase: true, maxlength: 32, default: null },
  dob: { type: String, validate: { validator: (value) => value === null || isDateOnly(value), message: "Invalid date." }, default: null },
  monthlySalaryPaise: { ...money, default: null },
  employmentMode: { type: String, enum: [...employmentModes, null], default: null }
};
var eligibilitySchema = new Schema2({
  eligible: { type: Boolean, required: true },
  evaluatedAt: { type: Date, required: true },
  ageYears: { type: Number, min: 0, validate: safeInteger, default: null },
  failures: { type: [new Schema2({
    field: { type: String, enum: Object.keys(personalFields), required: true },
    code: { type: String, enum: ["REQUIRED", "INVALID_FORMAT", "PAN_INVALID", "AGE_OUT_OF_RANGE", "SALARY_TOO_LOW", "EMPLOYMENT_INELIGIBLE"], required: true },
    message: { type: String, required: true }
  }, { _id: false, strict: "throw" })], default: [] }
}, { _id: false, strict: "throw" });

// apps/api/src/modules/applications/application.model.ts
var applicationSchema2 = new Schema3({
  borrowerId: { ...reference("User"), immutable: true },
  personalDetails: { type: new Schema3(personalFields, { _id: false, strict: "throw" }), default: () => ({}) },
  principalPaise: { type: Number, min: 5e6, max: 5e7, validate: safeInteger, required: true, default: 5e6 },
  tenureDays: { type: Number, min: 30, max: 365, validate: safeInteger, required: true, default: 30 },
  salarySlipId: { type: Schema3.Types.ObjectId, ref: "Document", default: null },
  state: { type: String, enum: applicationStates, required: true, default: "DRAFT" },
  eligibilityAtSubmission: { type: eligibilitySchema, default: null },
  submittedAt: { type: Date, default: null }
}, { timestamps: true, strict: "throw", collection: "applications" });
applicationSchema2.index({ borrowerId: 1 }, { unique: true, partialFilterExpression: { state: "DRAFT" }, name: "one_draft_per_borrower" });
applicationSchema2.index({ borrowerId: 1, createdAt: -1 });
var Application = model2("Application", applicationSchema2);

// apps/api/src/modules/documents/document.model.ts
import { model as model3, Schema as Schema4 } from "mongoose";
var documentSchema2 = new Schema4({
  borrowerId: { ...reference("User"), immutable: true },
  applicationId: { ...reference("Application"), immutable: true },
  storageKey: { type: String, required: true, immutable: true },
  originalName: { type: String, required: true, maxlength: 255 },
  detectedMimeType: { type: String, enum: salarySlipMimeTypes, required: true },
  sizeBytes: { type: Number, min: 1, max: salarySlipMaxBytes, validate: safeInteger, required: true }
}, { timestamps: true, strict: "throw", collection: "documents" });
documentSchema2.index({ storageKey: 1 }, { unique: true });
documentSchema2.index({ applicationId: 1 });
var Document = model3("Document", documentSchema2);

// apps/api/src/modules/loans/loan.model.ts
import { model as model4, Schema as Schema5 } from "mongoose";
var applicantSchema = new Schema5({
  fullName: { ...personalFields.fullName, required: true },
  pan: { ...personalFields.pan, required: true, match: /^[A-Z]{5}[0-9]{4}[A-Z]$/ },
  dob: { ...personalFields.dob, required: true },
  monthlySalaryPaise: { ...money, required: true },
  employmentMode: { ...personalFields.employmentMode, required: true },
  email: { type: String, required: true, trim: true, lowercase: true }
}, { _id: false, strict: "throw" });
var statusEventSchema2 = new Schema5({
  fromStatus: { type: String, enum: [...loanStatuses, null], default: null },
  toStatus: { type: String, enum: loanStatuses, required: true },
  actorId: reference("User"),
  actorRole: { type: String, enum: roles, required: true },
  occurredAt: { type: Date, required: true },
  reason: { type: String, default: null }
}, { _id: false, strict: "throw" });
var loanSchema = new Schema5({
  borrowerId: { ...reference("User"), immutable: true },
  applicationId: { ...reference("Application"), immutable: true },
  applicantSnapshot: { type: applicantSchema, required: true, immutable: true },
  eligibilityAtSubmission: { type: eligibilitySchema, required: true, immutable: true },
  salarySlipId: { ...reference("Document"), immutable: true },
  principalPaise: { ...money, min: 5e6, max: 5e7, required: true, immutable: true },
  annualRatePercent: { type: Number, enum: [12], required: true, default: 12, immutable: true },
  tenureDays: { type: Number, min: 30, max: 365, validate: safeInteger, required: true, immutable: true },
  interestPaise: { ...money, required: true, immutable: true },
  totalRepaymentPaise: { ...money, required: true, immutable: true },
  totalPaidPaise: { ...money, required: true, default: 0 },
  status: { type: String, enum: loanStatuses, required: true, default: "APPLIED" },
  rejectionReason: { type: String, default: null },
  sanctionedAt: { type: Date, default: null },
  disbursedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  statusHistory: { type: [statusEventSchema2], required: true }
}, { timestamps: true, strict: "throw", collection: "loans" });
loanSchema.index({ applicationId: 1 }, { unique: true });
loanSchema.index({ status: 1, createdAt: -1 });
loanSchema.index({ borrowerId: 1, createdAt: -1 });
var Loan = model4("Loan", loanSchema);

// apps/api/src/middleware/ownership.ts
import { Types } from "mongoose";
function objectId(value) {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, "MALFORMED_REQUEST", "The resource ID is invalid.");
  return new Types.ObjectId(value);
}
async function ownedApplication(id, borrowerId) {
  const record = await Application.findOne({ _id: objectId(id), borrowerId: objectId(borrowerId) });
  if (!record) throw new HttpError(404, "NOT_FOUND", "The requested resource was not found.");
  return record;
}
async function ownedLoan(id, borrowerId) {
  const record = await Loan.findOne({ _id: objectId(id), borrowerId: objectId(borrowerId) });
  if (!record) throw new HttpError(404, "NOT_FOUND", "The requested resource was not found.");
  return record;
}

// apps/api/src/modules/applications/eligibility.ts
function evaluateEligibility(details, now) {
  const failures = [];
  let ageYears = null;
  const today = indiaDate(now);
  for (const field of personalFieldNames) {
    const value = details[field];
    if (value == null || typeof value === "string" && !value.trim()) {
      failures.push({ field, code: "REQUIRED", message: `${personalFieldLabels[field]} is required.` });
      continue;
    }
    const parsed = personalFieldSchemas[field].safeParse(value);
    if (!parsed.success || field === "dob" && String(parsed.data) > today) {
      failures.push({ field, code: "INVALID_FORMAT", message: `${personalFieldLabels[field]} is invalid.` });
      continue;
    }
    if (field === "pan" && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(parsed.data))) {
      failures.push({ field, code: "PAN_INVALID", message: "PAN must contain five letters, four digits, and one letter." });
    } else if (field === "dob") {
      ageYears = completedAge(String(parsed.data), today);
      if (ageYears < 23 || ageYears > 50) failures.push({ field, code: "AGE_OUT_OF_RANGE", message: "Age must be between 23 and 50 years, inclusive." });
    } else if (field === "monthlySalaryPaise" && Number(parsed.data) < 25e5) {
      failures.push({ field, code: "SALARY_TOO_LOW", message: "Monthly salary must be at least INR 25,000." });
    } else if (field === "employmentMode" && parsed.data === "UNEMPLOYED") {
      failures.push({ field, code: "EMPLOYMENT_INELIGIBLE", message: "Employment must be Salaried or Self-employed." });
    }
  }
  return { eligible: failures.length === 0, evaluatedAt: now.toISOString(), ageYears, failures };
}
function requireEligibility(details, now) {
  const result = evaluateEligibility(details, now);
  if (!result.eligible) {
    const fields = {};
    for (const failure of result.failures) (fields[`personalDetails.${failure.field}`] ??= []).push(failure.message);
    throw new HttpError(422, "BRE_FAILED", "The application does not meet the eligibility requirements.", { fields });
  }
  return result;
}

// apps/api/src/modules/applications/application.service.ts
function personalDetails(record) {
  return {
    fullName: record.fullName ?? null,
    pan: record.pan ?? null,
    dob: record.dob ?? null,
    monthlySalaryPaise: record.monthlySalaryPaise ?? null,
    employmentMode: record.employmentMode ?? null
  };
}
function assertDraft(record) {
  if (record.state !== "DRAFT") throw new HttpError(409, "APPLICATION_LOCKED", "This application has already been submitted and cannot be edited.");
}
async function applicationDTOs(records, now) {
  if (!records.length) return [];
  const documents = await Document.find({ _id: { $in: records.flatMap((record) => record.salarySlipId ? [record.salarySlipId] : []) } });
  const loans = await Loan.find({ applicationId: { $in: records.map((record) => record._id) } }).select("_id applicationId borrowerId");
  return records.map((record) => {
    const details = personalDetails(record.personalDetails);
    const stored = record.eligibilityAtSubmission;
    if (record.state === "SUBMITTED" && !stored) throw new Error("Submitted application has no eligibility snapshot.");
    const eligibility = record.state === "DRAFT" ? evaluateEligibility(details, now) : {
      eligible: stored.eligible,
      evaluatedAt: stored.evaluatedAt.toISOString(),
      ageYears: stored.ageYears ?? null,
      failures: stored.failures.map(({ field, code, message }) => ({ field, code, message }))
    };
    const document = documents.find((item) => item._id.equals(record.salarySlipId) && item.borrowerId.equals(record.borrowerId) && item.applicationId.equals(record._id));
    const salarySlip = document ? {
      id: document.id,
      originalName: document.originalName,
      mimeType: document.detectedMimeType,
      sizeBytes: document.sizeBytes,
      createdAt: document.createdAt.toISOString()
    } : null;
    return {
      id: record.id,
      borrowerId: record.borrowerId.toHexString(),
      state: record.state,
      personalDetails: details,
      loanConfig: { principalPaise: record.principalPaise, tenureDays: record.tenureDays },
      salarySlip,
      eligibility,
      nextStep: applicationNextStep(eligibility.eligible, salarySlip !== null, record.state),
      loanId: loans.find((loan) => loan.applicationId.equals(record._id) && loan.borrowerId.equals(record.borrowerId))?.id ?? null,
      submittedAt: record.submittedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  });
}
async function startDraft(borrowerId, now) {
  const filter = { borrowerId: objectId(borrowerId), state: "DRAFT" };
  const existing = await Application.findOne(filter);
  if (existing) return { created: false, data: (await applicationDTOs([existing], now))[0] };
  try {
    const record = await Application.create(filter);
    return { created: true, data: (await applicationDTOs([record], now))[0] };
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 11e3) throw error;
    const record = await Application.findOne(filter);
    if (!record) throw new HttpError(503, "RETRYABLE_CONFLICT", "The draft changed while it was opening. Please retry.");
    return { created: false, data: (await applicationDTOs([record], now))[0] };
  }
}
async function listApplications(borrowerId, query, now) {
  const filter = { borrowerId: objectId(borrowerId), ...query.state ? { state: query.state } : {} };
  const records = await Application.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit);
  const total = await Application.countDocuments(filter);
  return { data: await applicationDTOs(records, now), pagination: { page: query.page, limit: query.limit, total } };
}
async function getApplication(id, borrowerId, now) {
  return (await applicationDTOs([await ownedApplication(id, borrowerId)], now))[0];
}
async function updateApplication(id, borrowerId, input, now) {
  const filter = { _id: objectId(id), borrowerId: objectId(borrowerId) };
  const updates = {};
  for (const [field, value] of Object.entries(input.personalDetails ?? {})) {
    if (value !== void 0) updates[`personalDetails.${field}`] = value;
  }
  if (input.loanConfig?.principalPaise !== void 0) updates.principalPaise = input.loanConfig.principalPaise;
  if (input.loanConfig?.tenureDays !== void 0) updates.tenureDays = input.loanConfig.tenureDays;
  const record = await Application.findOneAndUpdate({ ...filter, state: "DRAFT" }, { $set: updates }, {
    returnDocument: "after",
    runValidators: true
  });
  if (!record) {
    assertDraft(await ownedApplication(id, borrowerId));
    throw new HttpError(409, "APPLICATION_LOCKED", "The application changed. Please reload.");
  }
  return (await applicationDTOs([record], now))[0];
}
async function evaluateApplication(id, borrowerId, now) {
  const record = await ownedApplication(id, borrowerId);
  assertDraft(record);
  return evaluateEligibility(personalDetails(record.personalDetails), now);
}

// apps/api/src/modules/applications/application.routes.ts
var applicationRoutes = Router2();
applicationRoutes.post("/", async (req, res) => {
  emptyMutation(req);
  const result = await startDraft(currentUser(req).id, /* @__PURE__ */ new Date());
  res.status(result.created ? 201 : 200).json({ data: result.data });
});
applicationRoutes.get("/", async (req, res) => {
  noBody(req);
  res.json(await listApplications(currentUser(req).id, applicationListQuerySchema.parse(req.query), /* @__PURE__ */ new Date()));
});
applicationRoutes.get("/:id", async (req, res) => {
  noBody(req);
  z9.strictObject({}).parse(req.query);
  res.json({ data: await getApplication(z9.string().parse(req.params.id), currentUser(req).id, /* @__PURE__ */ new Date()) });
});
applicationRoutes.patch("/:id", async (req, res) => {
  assertJsonContent(req);
  z9.strictObject({}).parse(req.query);
  const now = /* @__PURE__ */ new Date();
  const input = updateApplicationSchema(now).parse(req.body);
  res.json({ data: await updateApplication(z9.string().parse(req.params.id), currentUser(req).id, input, now) });
});
applicationRoutes.post("/:id/eligibility", async (req, res) => {
  emptyMutation(req);
  res.json({ data: await evaluateApplication(z9.string().parse(req.params.id), currentUser(req).id, /* @__PURE__ */ new Date()) });
});

// apps/api/src/modules/sales/sales.routes.ts
import { Router as Router3 } from "express";
import { z as z10 } from "zod";

// apps/api/src/modules/sales/sales.service.ts
function leadPipeline(id, q) {
  const pipeline2 = [
    { $match: { role: "BORROWER", ...id ? { _id: objectId(id) } : {} } },
    { $lookup: { from: "loans", localField: "_id", foreignField: "borrowerId", pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }], as: "loans" } },
    { $lookup: { from: "applications", localField: "_id", foreignField: "borrowerId", pipeline: [{ $match: { state: "SUBMITTED" } }, { $limit: 1 }, { $project: { _id: 1 } }], as: "submitted" } },
    { $match: { "loans.0": { $exists: false }, "submitted.0": { $exists: false } } },
    { $lookup: { from: "applications", localField: "_id", foreignField: "borrowerId", pipeline: [{ $match: { state: "DRAFT" } }, { $limit: 1 }], as: "drafts" } },
    { $set: { draft: { $arrayElemAt: ["$drafts", 0] } } }
  ];
  if (q) pipeline2.push({ $match: { $expr: { $or: ["email", "draft.personalDetails.fullName"].map((field) => ({
    $gte: [{ $indexOfCP: [{ $toLower: { $ifNull: [`$${field}`, ""] } }, { $literal: q.toLowerCase() }] }, 0]
  })) } } });
  pipeline2.push({ $project: { _id: 1, email: 1, createdAt: 1, draft: 1 } });
  return pipeline2;
}
function toLead(row, now) {
  const draft = row.draft;
  const details = draft ? personalDetails(draft.personalDetails) : null;
  const eligibility = details ? evaluateEligibility(details, now) : null;
  const nextStep = applicationNextStep(eligibility?.eligible ?? false, !!draft?.salarySlipId, "DRAFT");
  return {
    borrowerId: row._id.toHexString(),
    email: row.email,
    fullName: details?.fullName ?? null,
    registeredAt: row.createdAt.toISOString(),
    draftId: draft?._id.toHexString() ?? null,
    nextStep,
    eligible: eligibility?.eligible ?? null,
    employmentMode: details?.employmentMode ?? null,
    eligibility,
    draftUpdatedAt: draft?.updatedAt.toISOString() ?? null
  };
}
async function listLeads(query, now) {
  const results = await User.aggregate([
    ...leadPipeline(void 0, query.q),
    { $facet: { data: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: pageOffset(query) }, { $limit: query.limit }], count: [{ $count: "total" }] } }
  ]);
  const result = results[0];
  const data = result.data.map((row) => {
    const lead = toLead(row, now);
    return {
      borrowerId: lead.borrowerId,
      email: lead.email,
      fullName: lead.fullName,
      registeredAt: lead.registeredAt,
      draftId: lead.draftId,
      nextStep: lead.nextStep,
      eligible: lead.eligible
    };
  });
  return { data, pagination: { page: query.page, limit: query.limit, total: result.count[0]?.total ?? 0 } };
}
async function getLead(id, now) {
  const [row] = await User.aggregate(leadPipeline(id));
  if (!row) throw new HttpError(404, "NOT_FOUND", "The requested lead was not found.");
  return toLead(row, now);
}

// apps/api/src/modules/sales/sales.routes.ts
var salesRoutes = Router3();
salesRoutes.get("/leads", async (req, res) => {
  noBody(req);
  res.json(await listLeads(salesListQuerySchema.parse(req.query), /* @__PURE__ */ new Date()));
});
salesRoutes.get("/leads/:id", async (req, res) => {
  noBody(req);
  z10.strictObject({}).parse(req.query);
  res.json({ data: await getLead(z10.string().parse(req.params.id), /* @__PURE__ */ new Date()) });
});

// apps/api/src/modules/documents/document.routes.ts
import { Router as Router4 } from "express";
import { pipeline } from "node:stream/promises";
import { z as z11 } from "zod";

// apps/api/src/modules/documents/document.service.ts
import mongoose2, { Types as Types2 } from "mongoose";
async function assertUploadAllowed(id, borrowerId) {
  const application = await ownedApplication(id, borrowerId);
  assertDraft(application);
  requireEligibility(personalDetails(application.personalDetails), /* @__PURE__ */ new Date());
}
async function removeUnreferenced(storage, id, key) {
  try {
    if (await Application.exists({ salarySlipId: id })) return;
    if (await Loan.exists({ salarySlipId: id })) return;
    await storage.remove(key);
    await Document.deleteOne({ _id: id, storageKey: key });
  } catch {
    console.error("Unreferenced document cleanup deferred; storage reconciliation may be needed.");
  }
}
async function attachSalarySlip(storage, applicationId, borrowerId, file) {
  const id = new Types2.ObjectId();
  let previous;
  try {
    const result = await mongoose2.connection.transaction(async (session) => {
      previous = void 0;
      const application = await Application.findOne({ _id: objectId(applicationId), borrowerId: objectId(borrowerId) }).session(session);
      if (!application) throw new HttpError(404, "NOT_FOUND", "Application not found.");
      assertDraft(application);
      requireEligibility(personalDetails(application.personalDetails), /* @__PURE__ */ new Date());
      if (await Loan.exists({ applicationId: application._id }).session(session) || application.salarySlipId && await Loan.exists({ salarySlipId: application.salarySlipId }).session(session)) {
        throw new HttpError(409, "APPLICATION_LOCKED", "A submitted loan references this application or document.");
      }
      if (application.salarySlipId) {
        const old = await Document.findOne({ _id: application.salarySlipId, applicationId: application._id, borrowerId: application.borrowerId }).session(session);
        if (old) previous = { id: old._id, key: old.storageKey };
      }
      const document = new Document({
        _id: id,
        applicationId: application._id,
        borrowerId: application.borrowerId,
        storageKey: file.key,
        originalName: file.originalName,
        detectedMimeType: file.mimeType,
        sizeBytes: file.sizeBytes
      });
      await document.save({ session });
      const updated = await Application.updateOne({ _id: application._id, state: "DRAFT" }, { $set: { salarySlipId: id } }, { session, runValidators: true });
      if (updated.modifiedCount !== 1) throw new HttpError(409, "APPLICATION_LOCKED", "The application changed. Please reload.");
      return { id: id.toHexString(), originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, createdAt: document.createdAt.toISOString() };
    });
    if (previous) await removeUnreferenced(storage, previous.id, previous.key);
    return result;
  } catch (error) {
    const uncertainCommit = error instanceof mongoose2.mongo.MongoError && error.hasErrorLabel("UnknownTransactionCommitResult");
    if (uncertainCommit) console.error("Document commit outcome is uncertain; retain bytes for reconciliation.");
    else await removeUnreferenced(storage, id, file.key);
    throw error;
  }
}
async function authorizedDocument(id, user) {
  const record = await Document.findById(objectId(id));
  const missing = () => new HttpError(404, "NOT_FOUND", "Document not found.");
  if (!record || user.role === "BORROWER" && !record.borrowerId.equals(user.id)) throw missing();
  const linkedLoan = await Loan.exists({ salarySlipId: record._id, applicationId: record.applicationId, borrowerId: record.borrowerId });
  if (user.role === "BORROWER") {
    const linkedApplication = await Application.exists({ _id: record.applicationId, borrowerId: record.borrowerId, salarySlipId: record._id });
    if (!linkedApplication && !linkedLoan) throw missing();
  } else if (user.role === "SANCTION" || user.role === "ADMIN") {
    if (!linkedLoan) throw missing();
  } else throw new HttpError(403, "FORBIDDEN", "You do not have permission to access documents.");
  return record;
}

// apps/api/src/modules/documents/document.storage.ts
import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, win32, posix } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { fileTypeFromFile } from "file-type";
var projectRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
var webRoot = resolve(projectRoot, "apps/web");
var keyPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(?:pdf|jpg|png|upload)$/;
function contains(parent, child) {
  const path = relative(parent, child);
  return path === "" || !path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path);
}
function uploadDirectory(configured) {
  const root = isAbsolute(configured) ? configured : resolve(projectRoot, configured);
  if (contains(webRoot, root) || contains(root, webRoot)) throw new Error("UPLOAD_DIR must be private and outside the web application.");
  return root;
}
function safeOriginalName(value) {
  return posix.basename(win32.basename(value)).replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/^\.+/, "").trim().slice(-255) || "salary-slip";
}
var documentUnavailable = () => new HttpError(503, "DOCUMENT_UNAVAILABLE", "The document storage is unavailable. Please retry.");
var invalidUpload = () => new HttpError(422, "VALIDATION_FAILED", "Provide exactly one nonempty file in the file field, with no other fields.");
var unsupported = () => new HttpError(415, "UNSUPPORTED_FILE_TYPE", "The file content, extension and MIME type must match PDF, JPG or PNG.");
var DocumentStorage = class {
  root;
  constructor(configured) {
    this.root = uploadDirectory(configured);
  }
  path(key) {
    if (!keyPattern.test(key)) throw documentUnavailable();
    return resolve(this.root, key);
  }
  async prepare() {
    try {
      await mkdir(this.root, { recursive: true, mode: 448 });
      const actual = await realpath(this.root);
      uploadDirectory(actual);
      if (relative(this.root, actual) !== "") throw documentUnavailable();
    } catch {
      throw documentUnavailable();
    }
  }
  async remove(key) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  async receive(req, res) {
    if (!req.is("multipart/form-data")) throw invalidUpload();
    await this.prepare();
    const temporaryKey = `${randomUUID()}.upload`;
    const options = {
      defParamCharset: "utf8",
      storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, this.root), filename: (_req, _file, cb) => cb(null, temporaryKey) }),
      limits: { fileSize: salarySlipMaxBytes, files: 1, fields: 0, parts: 1, fieldNameSize: 100 }
    };
    const parser = multer(options).single("file");
    try {
      await new Promise((resolve2, reject) => parser(req, res, (error) => error ? reject(error) : resolve2()));
      const file = req.file;
      if (!file || file.size === 0) throw invalidUpload();
      if (file.size > salarySlipMaxBytes) throw new multer.MulterError("LIMIT_FILE_SIZE");
      let detected;
      try {
        detected = await fileTypeFromFile(this.path(temporaryKey));
      } catch (error) {
        if (error instanceof Error && "code" in error) throw documentUnavailable();
        throw unsupported();
      }
      const mimeType = detected?.mime;
      const extensions = mimeType && salarySlipExtensions[mimeType];
      const extension = posix.extname(win32.basename(file.originalname)).toLowerCase();
      if (!mimeType || !extensions || file.mimetype !== mimeType || !extensions.includes(extension)) throw unsupported();
      const key = `${randomUUID()}${extensions[0]}`;
      try {
        await rename(this.path(temporaryKey), this.path(key));
      } catch {
        throw documentUnavailable();
      }
      return { key, originalName: safeOriginalName(file.originalname), mimeType, sizeBytes: file.size };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        throw new HttpError(413, "FILE_TOO_LARGE", "The maximum file size is 5,000,000 bytes.");
      }
      if (error instanceof Error && "code" in error && !(error instanceof multer.MulterError)) throw documentUnavailable();
      throw invalidUpload();
    } finally {
      await this.remove(temporaryKey).catch(() => {
        console.error("Temporary document cleanup failed.");
      });
    }
  }
  async open(key, sizeBytes) {
    try {
      const path = this.path(key);
      const entry = await lstat(path);
      if (!entry.isFile() || entry.isSymbolicLink()) throw documentUnavailable();
      const handle = await open(path, "r");
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== sizeBytes) throw documentUnavailable();
        return handle;
      } catch (error) {
        await handle.close();
        throw error;
      }
    } catch {
      throw documentUnavailable();
    }
  }
};

// apps/api/src/modules/documents/document.routes.ts
function documentRoutes(env2) {
  const router = Router4();
  const storage = new DocumentStorage(env2.UPLOAD_DIR);
  router.post("/borrower/applications/:id/salary-slip", async (req, res) => {
    z11.strictObject({}).parse(req.query);
    const user = currentUser(req);
    await assertUploadAllowed(req.params.id, user.id);
    const file = await storage.receive(req, res);
    const data = await attachSalarySlip(storage, req.params.id, user.id, file);
    res.status(201).json({ data });
  });
  router.get("/documents/:id", async (req, res, next) => {
    z11.strictObject({}).parse(req.query);
    noBody(req);
    const document = await authorizedDocument(req.params.id, currentUser(req));
    const file = await storage.open(document.storageKey, document.sizeBytes);
    res.attachment(safeOriginalName(document.originalName));
    res.set({ "Content-Type": document.detectedMimeType, "Content-Length": String(document.sizeBytes), "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
    try {
      await pipeline(file.createReadStream(), res);
    } catch {
      if (!res.destroyed) next(documentUnavailable());
    } finally {
      await file.close();
    }
  });
  return router;
}

// apps/api/src/modules/loans/loan.routes.ts
import { Router as Router6 } from "express";
import { z as z13 } from "zod";

// apps/api/src/modules/loans/loan.service.ts
import mongoose3 from "mongoose";
function loanSummary(record) {
  return loanSummarySchema.parse({
    id: record.id,
    applicationId: record.applicationId.toHexString(),
    borrower: { id: record.borrowerId.toHexString(), fullName: record.applicantSnapshot.fullName, email: record.applicantSnapshot.email },
    status: record.status,
    principalPaise: record.principalPaise,
    annualRatePercent: record.annualRatePercent,
    tenureDays: record.tenureDays,
    interestPaise: record.interestPaise,
    totalRepaymentPaise: record.totalRepaymentPaise,
    totalPaidPaise: record.totalPaidPaise,
    outstandingPaise: record.totalRepaymentPaise - record.totalPaidPaise,
    createdAt: record.createdAt.toISOString()
  });
}
function loanDetail(record) {
  return loanDetailSchema.parse({
    ...loanSummary(record),
    rejectionReason: record.rejectionReason ?? null,
    sanctionedAt: record.sanctionedAt?.toISOString() ?? null,
    disbursedAt: record.disbursedAt?.toISOString() ?? null,
    closedAt: record.closedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    statusHistory: record.statusHistory.map((event) => ({ fromStatus: event.fromStatus ?? null, toStatus: event.toStatus, actorId: event.actorId.toHexString(), actorRole: event.actorRole, occurredAt: event.occurredAt.toISOString(), reason: event.reason ?? null }))
  });
}
function reviewedLoan(record, slip) {
  const snapshot = record.applicantSnapshot;
  const eligibility = record.eligibilityAtSubmission;
  return reviewedLoanDetailSchema.parse({
    ...loanDetail(record),
    applicantSnapshot: { fullName: snapshot.fullName, email: snapshot.email, pan: snapshot.pan, dob: snapshot.dob, monthlySalaryPaise: snapshot.monthlySalaryPaise, employmentMode: snapshot.employmentMode },
    eligibilityAtSubmission: {
      eligible: eligibility.eligible,
      evaluatedAt: eligibility.evaluatedAt.toISOString(),
      ageYears: eligibility.ageYears ?? null,
      failures: eligibility.failures.map(({ field, code, message }) => ({ field, code, message }))
    },
    salarySlip: { id: slip.id, originalName: slip.originalName, mimeType: slip.detectedMimeType, sizeBytes: slip.sizeBytes, createdAt: slip.createdAt.toISOString() }
  });
}
function alreadySubmitted(id) {
  return new HttpError(409, "APPLICATION_ALREADY_SUBMITTED", "This application has already been submitted.", { meta: { loanId: id } });
}
async function submitApplication(id, borrowerId, storage) {
  const filter = { _id: objectId(id), borrowerId: objectId(borrowerId) };
  try {
    return await mongoose3.connection.transaction(async (session) => {
      const application = await Application.findOne(filter).session(session);
      if (!application) throw new HttpError(404, "NOT_FOUND", "Application not found.");
      const existing = await Loan.findOne({ applicationId: application._id, borrowerId: application.borrowerId }).session(session);
      if (existing) throw alreadySubmitted(existing.id);
      if (application.state !== "DRAFT") throw new HttpError(503, "APPLICATION_UNAVAILABLE", "The submitted application is unavailable. Please retry.");
      const now = /* @__PURE__ */ new Date();
      const details = personalDetails(application.personalDetails);
      const eligibility = requireEligibility(details, now);
      const configuration = loanConfigurationSchema.safeParse({ principalPaise: application.principalPaise, tenureDays: application.tenureDays });
      if (!configuration.success) throw new HttpError(422, "VALIDATION_FAILED", "The saved loan terms are invalid.", {
        fields: Object.fromEntries(configuration.error.issues.map((issue) => [`loanConfig.${issue.path.join(".")}`, [issue.message]]))
      });
      const terms = calculateLoan(configuration.data);
      if (!application.salarySlipId) throw new HttpError(422, "SALARY_SLIP_REQUIRED", "Attach a salary slip before applying.");
      const slip = await Document.findOne({ _id: application.salarySlipId, applicationId: application._id, borrowerId: application.borrowerId }).session(session);
      if (!slip) throw new HttpError(422, "SALARY_SLIP_REQUIRED", "A valid salary slip linked to this application is required.");
      const borrower = await User.findOne({ _id: application.borrowerId, role: "BORROWER" }).session(session);
      if (!borrower) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in again.");
      const updated = await Application.updateOne({ ...filter, state: "DRAFT" }, {
        $set: { state: "SUBMITTED", submittedAt: now, eligibilityAtSubmission: eligibility }
      }, { session, runValidators: true });
      if (updated.modifiedCount !== 1) throw new HttpError(409, "APPLICATION_LOCKED", "The application changed. Please reload.");
      const file = await storage.open(slip.storageKey, slip.sizeBytes);
      await file.close();
      const loan = new Loan({
        applicationId: application._id,
        borrowerId: application.borrowerId,
        applicantSnapshot: { ...details, email: borrower.email },
        eligibilityAtSubmission: eligibility,
        salarySlipId: slip._id,
        ...terms,
        totalPaidPaise: 0,
        status: "APPLIED",
        statusHistory: [{ fromStatus: null, toStatus: "APPLIED", actorId: borrower._id, actorRole: "BORROWER", occurredAt: now, reason: null }]
      });
      await loan.save({ session });
      return reviewedLoan(loan, slip);
    }, { readPreference: "primary", readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (error) {
    if (error instanceof mongoose3.mongo.MongoError && error.hasErrorLabel("UnknownTransactionCommitResult")) {
      throw new HttpError(503, "SUBMISSION_UNCONFIRMED", "Submission could not be confirmed. Refresh the application before retrying.");
    }
    if (error instanceof mongoose3.mongo.MongoServerError && error.code === 11e3) {
      const existing = await Loan.findOne({ applicationId: filter._id, borrowerId: filter.borrowerId });
      if (existing) throw alreadySubmitted(existing.id);
    }
    throw error;
  }
}
async function listBorrowerLoans(borrowerId, query) {
  const filter = { borrowerId: objectId(borrowerId), ...query.status === "ALL" ? {} : { status: query.status } };
  const records = await Loan.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit);
  const total = await Loan.countDocuments(filter);
  return { data: records.map(loanSummary), pagination: { page: query.page, limit: query.limit, total } };
}
async function getBorrowerLoan(id, borrowerId) {
  const loan = await ownedLoan(id, borrowerId);
  const slip = await Document.findOne({ _id: loan.salarySlipId, borrowerId: loan.borrowerId, applicationId: loan.applicationId });
  if (!slip) throw documentUnavailable();
  return reviewedLoan(loan, slip);
}

// apps/api/src/modules/payments/payment.routes.ts
import { Router as Router5 } from "express";
import { z as z12 } from "zod";

// apps/api/src/modules/payments/payment.service.ts
import mongoose4 from "mongoose";

// apps/api/src/modules/payments/payment.model.ts
import { model as model5, Schema as Schema6 } from "mongoose";
var paymentSchema2 = new Schema6({
  loanId: { ...reference("Loan"), immutable: true },
  utrNormalized: { type: String, trim: true, uppercase: true, match: /^[A-Z0-9-]+$/, maxlength: 100, required: true, immutable: true },
  amountPaise: { ...money, min: 1, required: true, immutable: true },
  paymentDate: { type: String, validate: isDateOnly, required: true, immutable: true },
  recordedBy: { ...reference("User"), immutable: true }
}, { timestamps: true, strict: "throw", collection: "payments" });
paymentSchema2.index({ utrNormalized: 1 }, { unique: true });
paymentSchema2.index({ loanId: 1, paymentDate: -1, createdAt: -1 });
var Payment = model5("Payment", paymentSchema2);

// apps/api/src/modules/payments/payment.service.ts
var collectionStatuses = ["DISBURSED", "CLOSED"];
function paymentDto(record) {
  return paymentSchema.parse({
    id: record.id,
    loanId: record.loanId.toHexString(),
    utr: record.utrNormalized,
    amountPaise: record.amountPaise,
    paymentDate: record.paymentDate,
    recordedBy: record.recordedBy.toHexString(),
    createdAt: record.createdAt.toISOString()
  });
}
function nameOrEmailFilter(q) {
  if (!q) return {};
  const needle = q.toLocaleLowerCase("en-US");
  return { $expr: { $or: ["applicantSnapshot.fullName", "applicantSnapshot.email"].map((field) => ({
    $gte: [{ $indexOfCP: [{ $toLower: `$${field}` }, { $literal: needle }] }, 0]
  })) } };
}
async function listCollectionLoans(query) {
  const statuses = query.status === "ALL" ? collectionStatuses : [query.status];
  const filter = { status: { $in: statuses }, ...nameOrEmailFilter(query.q) };
  const [records, total] = await Promise.all([
    Loan.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit),
    Loan.countDocuments(filter)
  ]);
  return { data: records.map(loanSummary), pagination: { page: query.page, limit: query.limit, total } };
}
async function getCollectionLoan(id) {
  const loan = await Loan.findOne({ _id: objectId(id), status: { $in: collectionStatuses } });
  if (!loan) throw new HttpError(404, "NOT_FOUND", "The requested loan was not found.");
  return loanDetail(loan);
}
async function paymentPage(loanId, query) {
  const filter = { loanId: objectId(loanId) };
  const [records, total] = await Promise.all([
    Payment.find(filter).sort({ paymentDate: -1, createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit),
    Payment.countDocuments(filter)
  ]);
  return { data: records.map(paymentDto), pagination: { page: query.page, limit: query.limit, total } };
}
async function listBorrowerPayments(id, borrowerId, query) {
  await ownedLoan(id, borrowerId);
  return paymentPage(id, query);
}
async function listCollectionPayments(id, query) {
  await getCollectionLoan(id);
  return paymentPage(id, query);
}
function paymentDateIsValid(loan, paymentDate, now) {
  const disbursedDate = loan.disbursedAt && indiaDate(loan.disbursedAt);
  return !!disbursedDate && paymentDate >= disbursedDate && paymentDate <= indiaDate(now);
}
function duplicateUtr() {
  return new HttpError(409, "UTR_ALREADY_EXISTS", "This UTR has already been recorded.");
}
async function recordPayment(id, actor, input, now = /* @__PURE__ */ new Date()) {
  const loanId = objectId(id);
  try {
    return await mongoose4.connection.transaction(async (session) => {
      const loan = await Loan.findOne({ _id: loanId, status: { $in: collectionStatuses } }).session(session);
      if (!loan) throw new HttpError(404, "NOT_FOUND", "The requested loan was not found.");
      const duplicate = await Payment.exists({ utrNormalized: input.utr }).session(session);
      if (duplicate) throw duplicateUtr();
      if (loan.status !== "DISBURSED") throw new HttpError(409, "INVALID_LOAN_STATE", "Closed loans cannot accept payments.");
      if (!paymentDateIsValid(loan, input.paymentDate, now)) {
        throw new HttpError(422, "PAYMENT_DATE_INVALID", "Use a date from disbursement through today.");
      }
      const outstanding = loan.totalRepaymentPaise - loan.totalPaidPaise;
      if (input.amountPaise > outstanding) {
        throw new HttpError(422, "PAYMENT_EXCEEDS_OUTSTANDING", "The payment cannot exceed the outstanding balance.");
      }
      const finalPayment = input.amountPaise === outstanding;
      const payment = new Payment({ loanId: loan._id, utrNormalized: input.utr, amountPaise: input.amountPaise, paymentDate: input.paymentDate, recordedBy: objectId(actor.id) });
      await payment.save({ session });
      const update = finalPayment ? {
        $inc: { totalPaidPaise: input.amountPaise },
        $set: { status: "CLOSED", closedAt: now },
        $push: { statusHistory: { fromStatus: "DISBURSED", toStatus: "CLOSED", actorId: objectId(actor.id), actorRole: actor.role, occurredAt: now, reason: null } }
      } : { $inc: { totalPaidPaise: input.amountPaise } };
      const updated = await Loan.findOneAndUpdate({
        _id: loan._id,
        status: "DISBURSED",
        totalPaidPaise: loan.totalPaidPaise,
        $expr: { $lte: [{ $add: ["$totalPaidPaise", input.amountPaise] }, "$totalRepaymentPaise"] }
      }, update, { returnDocument: "after", session, runValidators: true });
      if (!updated) throw new HttpError(409, "INVALID_LOAN_STATE", "The loan changed while recording this payment. Refresh and try again.");
      return { payment: paymentDto(payment), loan: loanDetail(updated) };
    }, { readPreference: "primary", readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (error) {
    if (error instanceof mongoose4.mongo.MongoError && error.hasErrorLabel("UnknownTransactionCommitResult")) {
      throw new HttpError(503, "PAYMENT_UNCONFIRMED", "Payment could not be confirmed. Refresh history before retrying with the same UTR.");
    }
    if (error instanceof mongoose4.mongo.MongoServerError && error.code === 11e3 && error.keyPattern?.utrNormalized) throw duplicateUtr();
    throw error;
  }
}

// apps/api/src/modules/payments/payment.routes.ts
var collectionRoutes = Router5();
collectionRoutes.get("/loans", async (req, res) => {
  noBody(req);
  res.json(await listCollectionLoans(collectionLoanListQuerySchema.parse(req.query)));
});
collectionRoutes.get("/loans/:id", async (req, res) => {
  noBody(req);
  z12.strictObject({}).parse(req.query);
  res.json({ data: await getCollectionLoan(req.params.id) });
});
collectionRoutes.get("/loans/:id/payments", async (req, res) => {
  noBody(req);
  res.json(await listCollectionPayments(req.params.id, paymentListQuerySchema.parse(req.query)));
});
collectionRoutes.post("/loans/:id/payments", async (req, res) => {
  assertJsonContent(req);
  z12.strictObject({}).parse(req.query);
  const data = await recordPayment(req.params.id, currentUser(req), recordPaymentSchema.parse(req.body));
  res.location(`/api/v1/collection/loans/${data.loan.id}/payments`).status(201).json({ data });
});
var borrowerPaymentRoutes = Router5();
borrowerPaymentRoutes.get("/loans/:id/payments", async (req, res) => {
  noBody(req);
  res.json(await listBorrowerPayments(req.params.id, currentUser(req).id, paymentListQuerySchema.parse(req.query)));
});

// apps/api/src/modules/loans/loan.routes.ts
function borrowerLoanRoutes(env2) {
  const router = Router6();
  const storage = new DocumentStorage(env2.UPLOAD_DIR);
  router.post("/applications/:id/submit", async (req, res) => {
    emptyMutation(req);
    const data = await submitApplication(req.params.id, currentUser(req).id, storage);
    res.location(`/api/v1/borrower/loans/${data.id}`).status(201).json({ data });
  });
  router.get("/loans", async (req, res) => {
    noBody(req);
    res.json(await listBorrowerLoans(currentUser(req).id, borrowerLoanListQuerySchema.parse(req.query)));
  });
  router.get("/loans/:id", async (req, res) => {
    noBody(req);
    z13.strictObject({}).parse(req.query);
    res.json({ data: await getBorrowerLoan(req.params.id, currentUser(req).id) });
  });
  router.use(borrowerPaymentRoutes);
  return router;
}

// apps/api/src/modules/loans/operations.routes.ts
import { Router as Router7 } from "express";
import { z as z14 } from "zod";

// apps/api/src/modules/loans/operations.service.ts
var disbursementStatuses = ["SANCTIONED", "DISBURSED", "CLOSED"];
function nameOrEmailFilter2(q) {
  if (!q) return {};
  const needle = q.toLocaleLowerCase("en-US");
  return { $expr: { $or: ["applicantSnapshot.fullName", "applicantSnapshot.email"].map((field) => ({
    $gte: [{ $indexOfCP: [{ $toLower: `$${field}` }, { $literal: needle }] }, 0]
  })) } };
}
async function listQueue(query, readable) {
  const statuses = query.status === "ALL" ? readable : [query.status];
  const filter = { status: { $in: statuses }, ...nameOrEmailFilter2(query.q) };
  const [records, total] = await Promise.all([
    Loan.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pageOffset(query)).limit(query.limit),
    Loan.countDocuments(filter)
  ]);
  return { data: records.map(loanSummary), pagination: { page: query.page, limit: query.limit, total } };
}
async function unavailableOrConflict(id) {
  if (await Loan.exists({ _id: objectId(id) })) {
    throw new HttpError(409, "INVALID_LOAN_STATE", "This loan is no longer available for that action. Refresh the page.");
  }
  throw new HttpError(404, "NOT_FOUND", "The requested loan was not found.");
}
async function reviewed(record) {
  const slip = await Document.findOne({ _id: record.salarySlipId, borrowerId: record.borrowerId, applicationId: record.applicationId });
  if (!slip) throw documentUnavailable();
  return reviewedLoan(record, slip);
}
function listSanctionLoans(query) {
  return listQueue(query, loanStatuses);
}
function listDisbursementLoans(query) {
  return listQueue(query, disbursementStatuses);
}
async function getSanctionLoan(id) {
  const loan = await Loan.findById(objectId(id));
  if (!loan) throw new HttpError(404, "NOT_FOUND", "The requested loan was not found.");
  return reviewed(loan);
}
async function getDisbursementLoan(id) {
  const loan = await Loan.findOne({ _id: objectId(id), status: { $in: disbursementStatuses } });
  if (!loan) throw new HttpError(404, "NOT_FOUND", "The requested loan was not found.");
  return loanDetail(loan);
}
async function decideLoan(id, actor, decision) {
  const now = /* @__PURE__ */ new Date();
  const approved = decision.decision === "APPROVE";
  const loan = await Loan.findOneAndUpdate({ _id: objectId(id), status: "APPLIED" }, {
    $set: approved ? { status: "SANCTIONED", sanctionedAt: now, rejectionReason: null } : { status: "REJECTED", rejectionReason: decision.reason },
    $push: { statusHistory: { fromStatus: "APPLIED", toStatus: approved ? "SANCTIONED" : "REJECTED", actorId: objectId(actor.id), actorRole: actor.role, occurredAt: now, reason: approved ? null : decision.reason } }
  }, { returnDocument: "after", runValidators: true });
  if (!loan) return unavailableOrConflict(id);
  return reviewed(loan);
}
async function disburseLoan(id, actor) {
  const now = /* @__PURE__ */ new Date();
  const loan = await Loan.findOneAndUpdate({ _id: objectId(id), status: "SANCTIONED" }, {
    $set: { status: "DISBURSED", disbursedAt: now },
    $push: { statusHistory: { fromStatus: "SANCTIONED", toStatus: "DISBURSED", actorId: objectId(actor.id), actorRole: actor.role, occurredAt: now, reason: null } }
  }, { returnDocument: "after", runValidators: true });
  if (!loan) return unavailableOrConflict(id);
  return loanDetail(loan);
}

// apps/api/src/modules/loans/operations.routes.ts
var sanctionRoutes = Router7();
sanctionRoutes.get("/loans", async (req, res) => {
  noBody(req);
  res.json(await listSanctionLoans(sanctionLoanListQuerySchema.parse(req.query)));
});
sanctionRoutes.get("/loans/:id", async (req, res) => {
  noBody(req);
  z14.strictObject({}).parse(req.query);
  res.json({ data: await getSanctionLoan(req.params.id) });
});
sanctionRoutes.post("/loans/:id/decision", async (req, res) => {
  assertJsonContent(req);
  z14.strictObject({}).parse(req.query);
  res.json({ data: await decideLoan(req.params.id, currentUser(req), sanctionDecisionSchema.parse(req.body)) });
});
var disbursementRoutes = Router7();
disbursementRoutes.get("/loans", async (req, res) => {
  noBody(req);
  res.json(await listDisbursementLoans(disbursementLoanListQuerySchema.parse(req.query)));
});
disbursementRoutes.get("/loans/:id", async (req, res) => {
  noBody(req);
  z14.strictObject({}).parse(req.query);
  res.json({ data: await getDisbursementLoan(req.params.id) });
});
disbursementRoutes.post("/loans/:id/disburse", async (req, res) => {
  emptyMutation(req);
  res.json({ data: await disburseLoan(req.params.id, currentUser(req)) });
});

// apps/api/src/app.ts
var helmet = createRequire(import.meta.url)("helmet");
function createApp(env2, checkDatabase = assertDatabaseReady) {
  const app2 = express();
  app2.disable("x-powered-by");
  app2.use(helmet());
  app2.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app2.use(protectMutations(env2));
  app2.use(cookieParser());
  app2.get("/api/v1/health", async (req, res) => {
    z15.strictObject({}).parse(req.query);
    try {
      await checkDatabase();
    } catch {
      throw new HttpError(503, "DEPENDENCY_UNAVAILABLE", "The database is not ready.");
    }
    const response = { data: { status: "ok", database: "connected" } };
    res.json(response);
  });
  app2.use("/api/v1/auth", authRoutes(env2));
  app2.use("/api/v1/borrower", authenticate(env2), requireRoles("BORROWER"));
  for (const module of dashboardModules) {
    app2.use(`/api/v1/${module}`, authenticate(env2), requireRoles(...moduleRoles[module]));
  }
  app2.use("/api/v1/documents", authenticate(env2), requireRoles("BORROWER", "SANCTION", "ADMIN"));
  app2.use(express.json({ limit: "100kb" }));
  app2.use("/api/v1/borrower/applications", applicationRoutes);
  app2.use("/api/v1/borrower", borrowerLoanRoutes(env2));
  app2.use("/api/v1/sales", salesRoutes);
  app2.use("/api/v1/sanction", sanctionRoutes);
  app2.use("/api/v1/disbursement", disbursementRoutes);
  app2.use("/api/v1/collection", collectionRoutes);
  app2.use("/api/v1", documentRoutes(env2));
  app2.use(notFound);
  app2.use(errorHandler);
  return app2;
}

// apps/api/src/config/env.ts
import { z as z16 } from "zod";
var originSchema = z16.string().transform((val) => val.trim().replace(/\/+$/, "")).pipe(
  z16.url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value;
  }, "Must be an HTTP(S) origin without a path or trailing slash.")
);
var environmentSchema = z16.object({
  NODE_ENV: z16.enum(["development", "test", "production"]).default("development"),
  API_HOST: z16.string().min(1).default("127.0.0.1"),
  API_PORT: z16.coerce.number().int().min(1).max(65535).default(4e3),
  WEB_ORIGIN: originSchema,
  MONGODB_URI: z16.string().regex(/^mongodb(?:\+srv)?:\/\/.+/, "Must be a MongoDB connection URI."),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z16.coerce.number().int().min(100).max(3e4).default(5e3),
  JWT_SECRET: z16.string().min(32).refine((value) => !value.startsWith("replace-with-"), "Generate a private secret using npm run setup."),
  JWT_TTL_SECONDS: z16.coerce.number().int().min(60).max(86400).default(3600),
  COOKIE_SECURE: z16.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  UPLOAD_DIR: z16.string().min(1).default(process.env.VERCEL ? "/tmp/uploads" : "storage/uploads")
}).superRefine((env2, ctx) => {
  if (env2.NODE_ENV === "production" && (!env2.COOKIE_SECURE || !env2.WEB_ORIGIN.startsWith("https://"))) {
    ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "Production requires secure cookies and an HTTPS WEB_ORIGIN." });
  }
});
function parseEnvironment(input) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:
${messages.join("\n")}`);
  }
  return result.data;
}

// apps/api/src/models/indexes.ts
async function ensureIndexes() {
  for (const model6 of [User, Application, Document, Loan, Payment]) {
    await model6.createIndexes();
  }
}

// apps/api/src/serverless.ts
var env;
var app;
var ready;
function getApp() {
  if (!app) {
    env = parseEnvironment(process.env);
    app = createApp(env);
  }
  return app;
}
async function initialize() {
  getApp();
  if (!ready && env) {
    ready = connectDatabase(env).then(() => ensureIndexes());
  }
  try {
    await ready;
  } catch (error) {
    ready = void 0;
    throw error;
  }
}
async function handler(req, res) {
  try {
    await initialize();
    const appInstance = getApp();
    if (req.url === "/api/index.js" || req.url === "/api" || req.url?.startsWith("/api/index.js?") || req.url?.startsWith("/api?")) {
      const original = req.originalUrl || req.headers["x-matched-path"] || req.headers["x-forwarded-uri"];
      if (typeof original === "string" && original.startsWith("/api")) {
        req.url = original;
      }
    }
    return await new Promise((resolve2, reject) => {
      res.on("finish", resolve2);
      res.on("close", resolve2);
      res.on("error", reject);
      appInstance(req, res, (err) => {
        if (err) reject(err);
        else resolve2();
      });
    });
  } catch (error) {
    console.error("Vercel API Serverless Handler error:", error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({
        error: {
          code: "INITIALIZATION_FAILED",
          message: error instanceof Error ? error.message : "Server initialization failed"
        }
      }));
    }
  }
}
export {
  handler as default
};
