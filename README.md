
# Cricket Scoring System — MERN

A cricket scoring application built with the MERN stack, with a microservices-oriented architecture planned for authentication, team management, player management, match scoring, and statistics.

## Project Status

### Implemented
- Authentication service foundation using Node.js and Express.
- MongoDB integration using Mongoose.
- User model and registration validation.
- Password hashing with bcrypt.
- JWT-based access authentication.
- Google Sign-In integration.
- Email and phone verification workflows.
- Email and phone password-reset workflows.
- Automated tests for validation, password handling, password reset, and session-version checks.
- Environment-variable validation using Zod.
- Basic API security using Helmet, CORS, cookies, and rate limiting.

### In Progress
- Completing the authentication service review.
- Integrating and testing the remaining application services.
- Preparing the project for deployment.

> Kafka, AI features, and other services should be documented as implemented only after their code and integration are verified.

## Technology Stack

- **Backend:** Node.js, Express.js
- **Database:** MongoDB, Mongoose
- **Authentication:** JWT, bcrypt, Google OAuth
- **Validation:** Zod
- **Email:** Nodemailer
- **Phone verification:** MSG91
- **Testing:** Node.js test runner, MongoDB Memory Server
- **Version control:** Git and GitHub

## Kafka match result notifications

Newly finalized matches appear in **Recent results** on the Matches page. Match Service
records a pending event in MongoDB in the same transaction as the result. The notification
worker publishes it to `cricket.match-finalized.v1` and consumes that topic to build the
feed served by `GET /api/v1/matches/notifications`. Unpublished events stay pending during
broker outages. Kafka can redeliver a result, and the feed stores one entry per match.

With Docker Desktop running, start Kafka from the repository root:

```sh
docker compose -f infrastructure/docker-compose.yml up -d --wait kafka
```

Keep the app services running as usual. In another terminal, run the worker using the
Match Service's existing `.env` and MongoDB database:

```sh
cd services/match-service
npm ci
npm run notifications
```

To run the worker inside Docker instead, set `NOTIFICATIONS_MONGODB_URI` in your shell
to the same match database using a hostname the container can reach. For a MongoDB replica
set, its advertised member addresses must also be reachable from the container. Then run
this from the repository root:

```sh
docker compose -f infrastructure/docker-compose.yml --profile notifications up -d --build
```

Finalize a match through scoring, then refresh Matches or check the feed endpoint.
The page refreshes every 30 seconds while visible. Matches finalized before this feature
was added do not generate feed entries.

## Repository Structure

```text
cricket-scoring-mern/
├── services/
│   └── auth-service/
│       ├── src/
│       │   ├── config/
│       │   ├── middleware/
│       │   ├── modules/
│       │   ├── tests/
│       │   ├── utils/
│       │   ├── app.js
│       │   └── server.js
│       ├── .env.example
│       ├── package.json
│       └── package-lock.json
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 22 or later
- npm
- MongoDB running locally or an accessible MongoDB instance
- Google OAuth credentials, MSG91 credentials, and SMTP credentials for the corresponding integrations

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/vamshi-1216/cricket-scoring-mern.git
cd cricket-scoring-mern
```

### 2. Enter the authentication service

```bash
cd services/auth-service
```

### 3. Install dependencies

```bash
npm ci
```

### 4. Configure environment variables

Copy `.env.example` to `.env`.

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Update `.env` with valid values for the required configuration variables. Never commit `.env` or publish real API keys, passwords, or signing secrets.

### 5. Start the authentication service

Ensure MongoDB is running, then execute:

```bash
npm run dev
```

The default service port is `4001`.

### 6. Run checks and tests

```bash
npm run check
npm test
```

## Security Notes

- Keep `.env` and all real credentials out of version control.
- Use a strong, unique JWT signing secret in production.
- Configure HTTPS, secure cookies, CORS origins, and production secrets before deployment.
- Use valid provider credentials to test Google Sign-In, email delivery, and phone verification.
- Review authentication rate limits and account recovery flows before production use.

## Deployment

AWS deployment is planned. Production infrastructure, environment variables, database connectivity, and service health should be verified before considering the application production-ready.

## License

No license has been specified yet.
