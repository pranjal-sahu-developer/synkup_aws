# SynkUp

SynkUp is a language exchange platform where users connect with others, send friend requests, chat in real time, and join video calls. It includes user onboarding, friend discovery, notifications, and theming.

**Live app:** [synkup.vercel.app](https://synkup.vercel.app)  
**API:** [synkup-backend-5mp1.onrender.com](https://synkup-backend-5mp1.onrender.com)

## Features

- User signup, login, and JWT-based session cookies
- Onboarding flow (bio, languages, location)
- Friend recommendations and friend requests
- Real-time chat powered by [Stream Chat](https://getstream.io/chat/)
- Video calls powered by [Stream Video](https://getstream.io/video/)
- Dark/light theme support

## Tech Stack

| Layer    | Technologies |
| -------- | ------------ |
| Frontend | React, Vite, Tailwind CSS, DaisyUI, React Router, TanStack Query, Zustand, Axios |
| Backend  | Node.js, Express, MongoDB, Mongoose, JWT, bcrypt |
| Realtime | Stream Chat & Stream Video SDK |
| Deploy   | Docker on AWS App Runner, GitHub Actions CI/CD, MongoDB Atlas |

## Project Structure

```
SynkUp/
├── frontend/          # React SPA (Vite)
│   ├── src/
│   │   ├── pages/     # Login, SignUp, Home, Chat, Friends, etc.
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/       # API client & Stream setup
│   └── vercel.json
└── backend/           # Express REST API
    ├── controllers/
    ├── middleware/
    ├── models/
    ├── routes/
    └── lib/           # DB & Stream helpers
```

## Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB)
- [Stream](https://getstream.io/) account (API key + secret)

## Local Setup

### 1. Clone the repositories

The frontend and backend are separate repos:

- Frontend: `https://github.com/pranjal-sahu-developer/synkup.git`
- Backend: `https://github.com/pranjal-sahu-developer/synkup_backend.git`

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=5001
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/synkup?retryWrites=true&w=majority
JWT_SECRET_KEY=your_jwt_secret
STREAM_API_KEY=your_stream_api_key
STREAM_SECRET_KEY=your_stream_secret_key
NODE_ENV=development
```

Start the server:

```bash
npm run dev
```

The API runs at `http://localhost:5001`.

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5001/api
VITE_STREAM_API_KEY=your_stream_api_key
```

Start the dev server:

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

## Environment Variables

### Backend (`backend/.env`)

| Variable           | Description |
| ------------------ | ----------- |
| `PORT`             | Server port (default: `5001`) |
| `MONGO_URI`        | MongoDB connection string |
| `JWT_SECRET_KEY`   | Secret for signing JWT tokens |
| `STREAM_API_KEY`   | Stream Chat API key |
| `STREAM_SECRET_KEY`| Stream Chat secret key |
| `NODE_ENV`         | `development` or `production` |

### Frontend (`frontend/.env`)

| Variable              | Description |
| --------------------- | ----------- |
| `VITE_API_URL`        | Backend API base URL (e.g. `http://localhost:5001/api`) |
| `VITE_STREAM_API_KEY` | Stream Chat API key (public) |

## API Endpoints

Base URL: `/api`

### Auth — `/api/auth`

| Method | Route          | Auth | Description |
| ------ | -------------- | ---- | ----------- |
| POST   | `/signup`      | No   | Register a new user |
| POST   | `/login`       | No   | Log in |
| POST   | `/logout`      | No   | Clear session cookie |
| GET    | `/me`          | Yes  | Get current user |
| POST   | `/onboarding`  | Yes  | Complete user profile |

### Users — `/api/users`

| Method | Route                              | Auth | Description |
| ------ | ---------------------------------- | ---- | ----------- |
| GET    | `/`                                | Yes  | Recommended users |
| GET    | `/friends`                         | Yes  | User's friends |
| POST   | `/friend-request/:id`              | Yes  | Send friend request |
| PUT    | `/friend-request/:id/accept`       | Yes  | Accept friend request |
| GET    | `/friend-requests`                 | Yes  | Incoming requests |
| GET    | `/outgoing-friend-requests`        | Yes  | Outgoing requests |

### Chat — `/api/chat`

| Method | Route    | Auth | Description |
| ------ | -------- | ---- | ----------- |
| GET    | `/token` | Yes  | Stream Chat token |

### Health — `/api/health`

| Method | Route     | Auth | Description |
| ------ | --------- | ---- | ----------- |
| GET    | `/health` | No   | Server and database status |

## Deployment (Docker + AWS App Runner + GitHub Actions)

The production image is a **single container**: Express serves `/api` and the Vite build. That keeps cookies same-origin on AWS.

### 0. One-time accounts and tools

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), start it, and finish the first-run screens (WSL / license) until the whale icon is idle.
2. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).
3. Create an [AWS account](https://aws.amazon.com/). In IAM, create a user with programmatic access (AdministratorAccess is fine for the first deploy). Create an access key.
4. In a new terminal run `aws configure` and paste the access key, secret, region `ap-south-1`, output `json`.
5. In MongoDB Atlas → **Network Access**, allow `0.0.0.0/0` so App Runner can reach the cluster.

Check what is still missing:

```powershell
powershell -ExecutionPolicy Bypass -File infra/check-prereqs.ps1
```

### 1. Confirm local env files

`backend/.env` must have `MONGO_URI`, `JWT_SECRET_KEY`, `STREAM_API_KEY`, `STREAM_SECRET_KEY`.  
`frontend/.env` must have `VITE_STREAM_API_KEY`.

### 2. First deploy (makes it live)

From the repo root, with Docker running:

```powershell
powershell -ExecutionPolicy Bypass -File infra/bootstrap.ps1
```

The script creates an ECR repo, builds and pushes the image, and creates an App Runner service. When it finishes, open the printed `https://....awsapprunner.com` URL and check `/api/health`.

Optional local Docker check before AWS:

```powershell
docker compose --env-file frontend/.env up --build
```

Then open `http://localhost:5001`.

### 3. CI/CD on every push to `main`

1. Put this folder on GitHub (new repo is fine).
2. In the GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `VITE_STREAM_API_KEY`
   - `APP_RUNNER_SERVICE_ARN` (printed by `bootstrap.ps1`)
3. Push to `main`. `.github/workflows/deploy.yml` builds the image, pushes it to ECR, and starts an App Runner deployment.

Optional extra origin for CORS (only if the UI is hosted on a different domain):

```env
FRONTEND_ORIGIN=https://your-other-domain.com
```

## Scripts

### Backend

| Command       | Description |
| ------------- | ----------- |
| `npm run dev` | Start with nodemon |
| `npm start`   | Start production server |

### Frontend

| Command         | Description |
| --------------- | ----------- |
| `npm run dev`   | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## License

ISC
