# Loan Management System

A role-based loan workflow application for borrower applications, approval, disbursement, and repayment collection.

## Stack

- Next.js, React, TypeScript, and Tailwind CSS
- Express and Mongoose
- MongoDB Atlas

## Requirements

- Node.js 24
- npm 11
- A MongoDB Atlas cluster and database user
- Google Chrome for browser tests

## Local Setup

Install dependencies and prepare local configuration:

```sh
npm ci
npm run setup
```

Set the following value in the root `.env` file. Use the Atlas driver connection string, not the Atlas website URL:

```dotenv
MONGODB_URI=mongodb+srv://<db-user>:<encoded-password>@<cluster-host>/lms?retryWrites=true&w=majority
```

The Atlas database user needs write access, and the cluster network access list must allow the machine or host running the API. Password characters such as `@`, `:`, `/`, `?`, `#`, and `%` must be URL-encoded.

Verify the database, create demonstration accounts, and start the application:

```sh
npm run db:check
npm run seed
npm run dev
```

Open `http://localhost:3000`. The health endpoint is available at `http://localhost:3000/api/v1/health`.

For a production-style local start, run `npm run build` followed by `npm run start`.

## Demo Accounts

`npm run seed` creates synthetic accounts using password `LmsDemo!2026`:

| Role | Email |
| --- | --- |
| Admin | `admin@lms.example.test` |
| Sales | `sales@lms.example.test` |
| Sanction | `sanction@lms.example.test` |
| Disbursement | `disbursement@lms.example.test` |
| Collection | `collection@lms.example.test` |
| Borrower | `borrower@lms.example.test` |

Do not use these accounts outside a synthetic demonstration environment.

## Loan Workflow

1. A borrower registers, creates an application, and completes personal and employment details.
2. Eligibility requires an age from 23 through 50, monthly salary of at least INR 25,000, a valid PAN, and Salaried or Self-employed employment.
3. The borrower uploads a nonempty PDF, JPG, JPEG, or PNG salary slip up to 5 MB.
4. Loan terms allow INR 50,000-500,000 for 30-365 days. Interest is simple interest at 12% per year.
5. Submission creates one `APPLIED` loan and freezes the submitted application details and salary slip.
6. Sanction or Admin approves or rejects the loan. Disbursement or Admin disburses approved loans.
7. Collection or Admin records positive payments with globally unique UTRs. Payments cannot exceed the outstanding balance.
8. The exact final payment changes the loan status to `CLOSED`.

For INR 100,000 over 365 days, the repayment total is INR 112,000. Payments of INR 40,000 and INR 72,000 close that loan.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the shared package watcher, API, and web app locally |
| `npm run build` | Build every workspace |
| `npm run start` | Start the built API and web app |
| `npm run db:check` | Verify Atlas connectivity, write access, and transactions |
| `npm run seed` | Create or preserve synthetic demonstration accounts |
| `npm run lint` | Lint source code and tests |
| `npm run typecheck` | Type-check every workspace |
| `npm test` | Run database-independent API tests |
| `npm run test:integration` | Run Atlas integration tests using disposable test data |
| `npm run test:browser` | Run desktop and mobile Playwright workflows |

Run browser tests only while the app is running and Chrome is installed. Do not run integration or browser tests against customer data.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT`, `WEB_ORIGIN` | Web server port and exact browser origin |
| `API_HOST`, `API_PORT`, `API_ORIGIN` | API bind address, port, and Next.js proxy target |
| `MONGODB_URI` | MongoDB Atlas driver connection string |
| `JWT_SECRET`, `JWT_TTL_SECONDS` | Session signing secret and lifetime |
| `COOKIE_SECURE` | Set to `true` when serving over HTTPS |
| `UPLOAD_DIR` | Private salary-slip directory; defaults to `storage/uploads` (`/tmp/uploads` on Vercel) |

## Vercel Deployment Guide

This repository is structured as an npm monorepo (`apps/api`, `apps/web`, and `packages/shared`). Because the backend is an Express + Mongoose serverless API and the frontend is Next.js, deploy them as **two connected projects** on Vercel from this single repository.

### Prerequisites

1. **MongoDB Atlas Cluster**:
   - Ensure you have a MongoDB Atlas connection string (`mongodb+srv://...`).
   - In MongoDB Atlas under **Network Access**, add `0.0.0.0/0` (Allow Access from Anywhere) so Vercel's serverless functions can connect.
   - Run local check and account seeding against Atlas before first deployment:
     ```sh
     npm run db:check
     npm run seed
     ```

2. **Push to GitHub**:
   - Create a GitHub repository and push your project code:
     ```sh
     git add .
     git commit -m "Prepare for Vercel deployment"
     git push origin main
     ```

---

### Step 1: Deploy the Backend API (`lms-api`)

1. Go to the [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..." > "Project"**.
2. Select your GitHub repository.
3. In the project setup page:
   - **Project Name**: `lms-api` (or a name of your choice)
   - **Framework Preset**: Select **Other** (leave as Other / default)
   - **Root Directory**: Click **Edit** and choose `apps/api`
   - Leave Build and Output Settings as default (handled automatically by `apps/api/vercel.json`).
4. Expand **Environment Variables** and configure:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/lms?retryWrites=true&w=majority`
   - `JWT_SECRET` = `<a-strong-random-secret-min-32-chars>` (generate via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `COOKIE_SECURE` = `true`
   - `UPLOAD_DIR` = `/tmp/uploads`
   - `WEB_ORIGIN` = `https://lms-web.vercel.app` *(set to your planned web project URL; you can update this in Vercel settings after deploying the frontend)*
5. Click **Deploy**.
6. Once deployed, note down your API URL (e.g., `https://lms-api-xxxx.vercel.app`).
   - Verify: visiting `https://<your-api>.vercel.app/` or `https://<your-api>.vercel.app/api/v1/health` should display `{"data":{"status":"ok","database":"connected"}}`.

---

### Step 2: Deploy the Frontend Web App (`lms-web`)

1. In the Vercel Dashboard, click **"Add New..." > "Project"** again.
2. Select the same GitHub repository.
3. In the project setup page:
   - **Project Name**: `lms-web` (or a name of your choice)
   - **Framework Preset**: **Next.js** (automatically detected)
   - **Root Directory**: Click **Edit** and choose `apps/web`
   - Leave Build and Output Settings as default (handled automatically by `apps/web/vercel.json`).
4. Expand **Environment Variables** and configure:
   - `API_ORIGIN` = `https://<your-api>.vercel.app` *(use the exact API URL from Step 1, without a trailing slash)*
5. Click **Deploy**.
6. Once deployed, note down your Web URL (e.g., `https://lms-web-xxxx.vercel.app`).

---

### Step 3: Link `WEB_ORIGIN` in the API Project

1. Return to your **`lms-api`** project in Vercel.
2. Go to **Settings > Environment Variables**.
3. Edit `WEB_ORIGIN` to match your exact frontend domain from Step 2 (e.g., `https://lms-web-xxxx.vercel.app` without a trailing slash).
4. Go to **Deployments** > click the three dots on the latest deployment > select **Redeploy** so the new `WEB_ORIGIN` takes effect.

---

### Step 4: Verification

1. Open your frontend URL in the browser (`https://lms-web.vercel.app`).
2. Log in with any demo account:
   - **Admin**: `admin@lms.example.test` / `LmsDemo!2026`
   - **Borrower**: `borrower@lms.example.test` / `LmsDemo!2026`
   - **Sales**: `sales@lms.example.test` / `LmsDemo!2026`
   - **Sanction**: `sanction@lms.example.test` / `LmsDemo!2026`
   - **Disbursement**: `disbursement@lms.example.test` / `LmsDemo!2026`
   - **Collection**: `collection@lms.example.test` / `LmsDemo!2026`
3. Verify that the complete flow (apply, approve, disburse, record payment, close) works smoothly.