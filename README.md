# LinkedIn Profile JSON Extraction API

[![Node.js CI](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-lightgrey.svg)](https://expressjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: Jest](https://img.shields.io/badge/Tests-33%20Passed-brightgreen.svg)](https://jestjs.io/)
[![Zero Cost](https://img.shields.io/badge/Budget-%240%20(Open%20Source)-blueviolet.svg)](#-0-budget-architecture)

A high-performance, modular, and production-ready **LinkedIn Profile JSON Extraction API** built strictly with **$0 budget** and free open-source tooling. It validates LinkedIn profile URLs, extracts public Schema.org structured metadata (JSON-LD), OpenGraph tags, and public DOM microdata, normalizes the data into a predictable JSON schema, enforces strict security and rate limiting, and provides comprehensive error diagnostics.

---

## 📌 Table of Contents
- [Overview & Philosophy](#-overview--engineering-philosophy)
- [Key Features](#-key-features)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Tech Stack & $0 Budget Strategy](#-tech-stack---0-budget-strategy)
- [API Reference](#-api-reference)
  - [`GET /health`](#1-get-health)
  - [`POST /api/linkedin/profile`](#2-post-apilinkedinprofile)
- [Response Schema & Normalization Contract](#-response-schema--normalization-contract)
- [Extraction Strategy & LinkedIn Realities](#-extraction-strategy--linkedin-realities)
- [Security & Rate Limiting](#-security--secret-protection)
- [Local Setup & Installation](#-local-setup--installation)
- [Running Automated Tests](#-running-automated-tests)
- [Zero-Cost ($0) Deployment Guide](#-zero-cost-0-deployment-guide)
- [Known Limitations & Challenges](#-known-limitations--honest-disclosure)
- [Future Roadmap](#-future-roadmap)

---

## 🚀 Overview & Engineering Philosophy

This service was engineered for a hiring challenge with strict constraints:
1. **$0 Infrastructure & Dependency Budget**: No paid proxies (BrightData/ScraperAPI), no paid headless browsers, and no paid SaaS APIs.
2. **100% Authentic & Honest Extraction**: **Zero mock data or hardcoded profiles in production paths**. If LinkedIn restricts or rate limits access, the API responds with structured diagnostics rather than faking data.
3. **Enterprise Security**: Zero secrets or credentials committed to the repository, in-memory IP rate limiting, Helmet HTTP headers, body size limits, and safe error masking (no stack traces leaked to clients).
4. **Resilient Multi-Layer Parsing**: Combines search-engine indexed JSON-LD (`application/ld+json`), OpenGraph meta tags, and public DOM selectors with fallback handling.

---

## ✨ Key Features

- **Strict Input Validation (Zod)**: Enforces valid LinkedIn URL syntax, domain verification (supports `linkedin.com` and international subdomains like `in.linkedin.com`, `uk.linkedin.com`), canonicalization, and rejection of company/school/job URLs and malicious schemes (`javascript:`, `data:`).
- **Multi-Signal Extraction Engine**:
  - **Schema.org Structured Data**: Extracts `Person` / `ProfilePage` JSON-LD containing name, headline, location, job history, and educational background.
  - **OpenGraph & Twitter Cards**: Extracts verified canonical URLs, high-res avatar URLs, titles, and public bios.
  - **Microdata & Fallback Selectors**: Parses experience, education, skills, certifications, and languages.
- **Data Normalizer & Transparency Metadata**: Normalizes all fields into predictable arrays and strings, while computing `fieldsAvailable` and `fieldsUnavailable` lists.
- **In-Memory TTL Caching**: Lightweight, zero-dependency caching (`node-cache`) to prevent repetitive upstream requests and avoid rate limits.
- **Configurable Rate Limiting**: Built-in IP rate limiter (`express-rate-limit`) protecting public endpoints against denial-of-service.
- **Automated Test Suite**: 33 unit and integration tests using Jest and Supertest with >90% line coverage and sanitized HTML fixtures.

---

## 🏛 Architecture & Data Flow

```
Client (cURL / Frontend / Webhook)
  │
  ▼
[ Express Application Pipeline ]
  │
  ├─► Security Layer: Helmet (HTTP Headers), CORS, 10KB Body Limit
  ├─► Rate Limiter: In-Memory IP Limiter (e.g., 30 requests/min)
  ├─► Request Logger: Latency, status, IP, sanitized metadata
  │
  ▼
[ Input Validation Layer: Zod ]
  │
  ├─► Bad URL / Scheme / Non-LinkedIn ──► 400 Bad Request
  ├─► Company / Job / Feed URL ─────────► 422 Unprocessable Entity
  │
  ▼
[ Profile Controller ]
  │
  ▼
[ LinkedIn Service (Orchestrator) ]
  │
  ├─► In-Memory TTL Cache Check ──(HIT)──► Return Cached JSON Response
  │ (MISS)
  ▼
[ Extractor Layer ]
  ├─► Randomized User-Agents & Sec-Ch-Ua Headers
  ├─► Optional Session Cookie (via ENV only)
  ├─► Native Fetch with AbortController Timeout (15s)
  │
  ▼
[ Parser Layer (Cheerio) ]
  ├─► JSON-LD Schema Extractor (<script type="application/ld+json">)
  ├─► OpenGraph & Meta Tag Extractor
  ├─► Public DOM Selectors & Microdata
  │
  ▼
[ Normalizer Layer ]
  ├─► Schema Sanitization & Field Mapping
  ├─► Transparency Tracker (fieldsAvailable vs fieldsUnavailable)
  │
  ▼
[ Centralized Error Handler ]
  └─► Uniform JSON Error Contract (Masked internal errors, zero stack leaks)
```

---

## 🛠 Tech Stack & $0 Budget Strategy

| Component | Technology | Rationale & $0 Strategy |
| :--- | :--- | :--- |
| **Runtime** | Node.js (v18+) | Native `fetch`, modern async/await, and fast execution |
| **Framework** | Express.js 5.x | Lightweight, unopinionated, battle-tested HTTP framework |
| **HTML Parser** | Cheerio | Blazing fast server-side HTML/DOM parsing with zero browser overhead |
| **Validation** | Zod | Type-safe, strict schema validation and error reporting |
| **Security** | Helmet & CORS | Standard HTTP security headers and cross-origin access control |
| **Rate Limiter**| express-rate-limit | Zero-cost in-memory IP rate limiting (no Redis required) |
| **Cache** | node-cache | In-memory TTL cache with zero external database dependencies |
| **Testing** | Jest + Supertest | Comprehensive unit and integration test suite |

---

## 📖 API Reference

### 1. `GET /health`
Returns service status, uptime, and in-memory cache diagnostics. Does **not** query LinkedIn to ensure instant health reporting.

#### Request:
```bash
curl -X GET http://localhost:3000/health
```

#### Response (`200 OK`):
```json
{
  "status": "ok",
  "service": "linkedin-profile-api",
  "version": "1.0.0",
  "uptime": 142,
  "timestamp": "2026-08-27T10:58:00.000Z",
  "cache": {
    "keys": 4,
    "hits": 12,
    "misses": 4
  }
}
```

---

### 2. `POST /api/linkedin/profile`
Accepts a LinkedIn personal profile URL and returns structured profile information.

#### Headers:
```http
Content-Type: application/json
```

#### Request Body:
```json
{
  "url": "https://www.linkedin.com/in/alex-rivera-engineer/"
}
```

#### Example cURL Command:
```bash
curl -X POST http://localhost:3000/api/linkedin/profile \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.linkedin.com/in/alex-rivera-engineer/"}'
```

#### Successful Response (`200 OK`):
```json
{
  "success": true,
  "source": "linkedin",
  "profile": {
    "url": "https://www.linkedin.com/in/alex-rivera-engineer/",
    "name": "Alex Rivera",
    "headline": "Senior Software Engineer at Tech Corp",
    "location": "San Francisco, CA, United States",
    "about": "Passionate backend engineer with 8+ years experience building distributed microservices, high-throughput APIs, and scalable cloud architectures.",
    "profileImage": "https://media.licdn.com/dms/image/v2/D4E03AQEexample/profile-displayphoto-shrink_800_800/0/123456789.jpg",
    "experience": [
      {
        "title": "Senior Software Engineer",
        "company": "Tech Corp",
        "location": "San Francisco, CA",
        "startDate": "Jan 2022",
        "endDate": "Present",
        "description": "Architected low-latency microservices processing 50M requests daily."
      }
    ],
    "education": [
      {
        "institution": "Stanford University",
        "degree": "Bachelor of Science in Computer Science",
        "fieldOfStudy": "",
        "startDate": "2014",
        "endDate": "2018",
        "description": ""
      }
    ],
    "skills": [
      "Node.js",
      "Express",
      "TypeScript",
      "Distributed Systems",
      "PostgreSQL",
      "Cloud Architecture"
    ],
    "certifications": [
      {
        "name": "AWS Certified Solutions Architect - Associate",
        "issuer": "Amazon Web Services",
        "issueDate": "Issued Jun 2023",
        "expirationDate": "",
        "credentialId": ""
      }
    ],
    "languages": [
      {
        "name": "English",
        "proficiency": "Native or bilingual proficiency"
      },
      {
        "name": "Spanish",
        "proficiency": "Professional working proficiency"
      }
    ]
  },
  "metadata": {
    "retrievedAt": "2026-08-27T10:58:00.000Z",
    "cached": false,
    "fieldsAvailable": [
      "name",
      "headline",
      "location",
      "about",
      "profileImage",
      "experience",
      "education",
      "skills",
      "certifications",
      "languages"
    ],
    "fieldsUnavailable": [],
    "publicExtraction": true
  }
}
```

---

## ⚠️ Standard Error Responses

All error responses return a standardized JSON structure with appropriate HTTP status codes:

| HTTP Status | Error Code | Scenario | Example Response |
| :--- | :--- | :--- | :--- |
| **400 Bad Request** | `VALIDATION_ERROR` | Missing or empty `url` field | `{"success":false,"error":{"code":"VALIDATION_ERROR","message":"The \"url\" field is required."}}` |
| **400 Bad Request** | `INVALID_URL` | Invalid syntax or non-LinkedIn domain | `{"success":false,"error":{"code":"INVALID_URL","message":"Hostname \"google.com\" is not a valid LinkedIn domain."}}` |
| **422 Unprocessable**| `UNSUPPORTED_URL` | Company, Job, or School URL | `{"success":false,"error":{"code":"UNSUPPORTED_URL","message":"URL points to an unsupported resource (/company/)."}}` |
| **404 Not Found** | `PROFILE_NOT_FOUND` | Profile does not exist (HTTP 404) | `{"success":false,"error":{"code":"PROFILE_NOT_FOUND","message":"The requested LinkedIn profile was not found."}}` |
| **403 Forbidden** | `PROFILE_RESTRICTED`| Profile is private or behind authwall | `{"success":false,"error":{"code":"PROFILE_RESTRICTED","message":"The LinkedIn profile is private or requires authentication."}}` |
| **429 Too Many Req** | `RATE_LIMIT_EXCEEDED`| API user exceeded rate limit | `{"success":false,"error":{"code":"RATE_LIMIT_EXCEEDED","message":"Rate limit exceeded. Max 30 req/min."}}` |
| **502 Bad Gateway** | `UPSTREAM_RATE_LIMITED`| LinkedIn returned HTTP 999 or 429 | `{"success":false,"error":{"code":"UPSTREAM_RATE_LIMITED","message":"LinkedIn anti-bot protection triggered (HTTP 999)."}}` |

---

## 🔍 Extraction Strategy & LinkedIn Realities

### The $0 Public Scraping Reality
LinkedIn is heavily protected by proprietary anti-bot systems (Cloudflare, PerimeterX, HTTP 999 Request Denied, and mandatory `/authwall` login redirects). 

This application employs a **multi-signal strategy**:
1. **Public Schema.org Structured Metadata**: LinkedIn embeds rich JSON-LD schema on public profile pages for Google and search engines to index. This contains verified identity, summary, location, job history, and education.
2. **OpenGraph & Twitter Card Extraction**: Extracts high-fidelity avatar image URLs, headlines, and canonical URLs.
3. **Cheerio DOM Selectors**: Extracts microdata elements if available on unauthenticated public views.
4. **Optional Authenticated Session Cookie**: If `LINKEDIN_LI_AT` is set in environment variables, the scraper transparently passes session cookies to retrieve restricted profile sections.

### Truthfulness Guarantee
- **No Mock Fallbacks in Production**: If a profile is restricted or blocked, the API returns a structured error code (`PROFILE_RESTRICTED` or `UPSTREAM_RATE_LIMITED`).
- **No Invented Values**: Missing fields are preserved as `null` or `[]`.

---

## 🔒 Security & Secret Protection

- **Zero Secrets in Repository**: `.env` is strictly ignored in `.gitignore`. `.env.example` provides clean placeholders.
- **Log Redaction**: Logger automatically masks sensitive tokens, cookies, and passwords.
- **HTTP Protection**: `helmet` enables standard security headers.
- **Strict Payload Limits**: Request bodies are restricted to 10KB to prevent memory exhaustion attacks.
- **In-Memory Rate Limiting**: `express-rate-limit` limits requests per IP with standard `RateLimit-*` headers.

---

## 💻 Local Setup & Installation

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Step-by-Step Setup:
```bash
# 1. Clone the repository
git clone https://github.com/faizkhatri196/Linkdin-Profile-JSON-fatch.git
cd Linkdin-Profile-JSON-fatch

# 2. Install dependencies
npm install

# 3. Create environment configuration
cp .env.example .env

# 4. Start development server with auto-reload
npm run dev

# Or start in production mode
npm start
```

The server will be running at `http://localhost:3000`.

---

## 🧪 Running Automated Tests

The test suite covers URL validation, HTML/JSON-LD parsing, data normalization, health endpoints, rate limiting, and centralized error handling:

```bash
# Run all tests
npm test

# Run tests with code coverage report
npm run test:coverage
```

### Test Results:
```
 PASS  tests/unit/extractor.test.js
 PASS  tests/unit/cache.test.js
 PASS  tests/unit/errorHandler.test.js
 PASS  tests/integration/profile.test.js
 PASS  tests/integration/rateLimiter.test.js
 PASS  tests/integration/health.test.js
 PASS  tests/unit/parser.test.js
 PASS  tests/unit/validator.test.js
 PASS  tests/unit/normalizer.test.js

Test Suites: 9 passed, 9 total
Tests:       33 passed, 33 total
Snapshots:   0 total
Time:        6.039 s
All files:   >90% line coverage
```

---

## 🌐 Zero-Cost ($0) Deployment Guide

This service can be deployed on several free platforms supporting Node.js with zero credit card requirements.

### Option 1: Render.com (Recommended Free Web Service)
1. Fork or push this repository to GitHub.
2. Sign up at [Render.com](https://render.com/) (Free tier).
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
6. Click **Deploy Web Service**. Render provides a free HTTPS endpoint (e.g. `https://linkedin-api-xxxx.onrender.com`).

### Option 2: Railway.app / Koyeb
- Deploy directly from GitHub repo.
- Railway/Koyeb automatically detects `package.json` and runs `npm start`.

---

## 📋 Known Limitations & Honest Disclosure

1. **LinkedIn Anti-Scraping / Authwalls**: LinkedIn enforces aggressive anti-scraping measures (HTTP 999 / CAPTCHAs) against known cloud IP addresses. For restricted profiles, session cookies (`LINKEDIN_LI_AT`) can be supplied via environment variables.
2. **Public View Variations**: LinkedIn renders different HTML structures for users depending on location, language, and search engine crawlers. The parser dynamically falls back between JSON-LD, OpenGraph, and DOM selectors.
3. **In-Memory Cache & Rate Limiter**: Designed for single-instance $0 deployments. In a multi-instance distributed production environment, backing with Redis would provide shared state across instances.

---

## 🔮 Future Roadmap

- [ ] Add support for LinkedIn Company / Organization profile extraction (`/company/...`).
- [ ] Add optional export formats (CSV / Markdown resume download).
- [ ] Add webhook notification support for long-running extraction jobs.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
