# Peti: deployment

**Live app:** _add the URL after deploying, or delete this line_

**Repository:** <https://github.com/INVgrimmjaw/Isocode_Labs>

## Run it locally

You need Docker. Node 22.12 or newer is only needed for the second option.

### Option 1: everything in Docker

1. Create the environment file.

   ```bash
   cp Backend/.env.example Backend/.env
   ```

2. Set `OTP_SECRET` in `Backend/.env` to any long random string, for example the output of `openssl rand -hex 32`.

3. Build and start Postgres, the API and the web server.

   ```bash
   docker compose up --build
   ```

4. Open <http://localhost:8080>. The tables and demo data are created on first start.

### Option 2: run the code directly

1. Start Postgres.

   ```bash
   docker compose up -d db
   ```

   Or use your own Postgres, and point `DATABASE_URL` in `Backend/.env` at it.

2. Set up and start the API.

   ```bash
   cd Backend
   npm install
   cp .env.example .env     # then set OTP_SECRET
   npm run setup            # creates the tables and loads the demo data
   npm run dev
   ```

3. In a second terminal, start the web app.

   ```bash
   cd Frontend
   npm install
   npm run dev
   ```

4. Open <http://localhost:5173>.

### Tests

```bash
docker compose exec db createdb -U peti peti_test   # once
cd Backend
npm test
```

API tests need `TEST_DATABASE_URL`, and that database is wiped on every run. Without it, only the unit tests run.

### Reset the demo data

```bash
cd Backend
npm run db:seed
```

## How it is deployed

Three parts, each in its own container:

| Part | What it is |
| --- | --- |
| `Frontend` | nginx serving the built web app. It compresses responses and forwards `/api` to the backend, so the browser sees a single origin and no CORS is needed |
| `Backend` | Node and Express. On start it applies database migrations, loads demo data if the database is empty, then serves the API |
| Database | PostgreSQL |

On a single server, `docker compose up -d --build` runs all three. Put HTTPS in front of port 8080.

On a host with separate services, build each folder from its own `Dockerfile`, provide a managed PostgreSQL, and set `BACKEND_URL` on the frontend to the backend's internal address.

Before going live with real shops, set `DEMO_MODE` to `false`, set `NODE_ENV` to `production` so cookies are HTTPS-only, and connect a real SMS gateway in `Backend/src/lib/sms.ts`.

## Environment variables

Names only. Real values are never stored in the repository.

**Backend**

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string |
| `OTP_SECRET` | Yes | Signs the stored hashes of sign-in codes |
| `DEMO_MODE` | No | `true` shows the OTP on the sign-in screen, because SMS is mocked. Never use with real users |
| `ANTHROPIC_API_KEY` | No | Enables reading messages with Claude. Without it the built-in matcher is used and the desk is told |
| `AI_MODEL` | No | Overrides the default Claude model |
| `PORT` | No | Port to listen on. Defaults to 4000 |
| `NODE_ENV` | No | `production` makes the session cookie HTTPS-only |
| `TEST_DATABASE_URL` | Tests only | Database used by `npm test`, wiped on every run |

**Frontend**

| Name | Required | Purpose |
| --- | --- | --- |
| `BACKEND_URL` | Yes, in Docker | Where nginx forwards `/api` |

## Demo logins

Enter the phone number on the sign-in screen and press **Send code**. No SMS is sent in demo mode: the code appears on screen in a green box, and tapping it fills it in.

| Who | Phone | Why this account |
| --- | --- | --- |
| Order desk (Priya) | 9000000099 | All desk screens |
| Gupta Kirana Store | 9000000001 | Regular shop with order history |
| Sharma General Store | 9000000002 | Close to its credit limit, so larger orders go on hold |
| New Bharat Provision | 9000000003 | Has its own special prices |

All shops, names and phone numbers are invented. Messaging is mocked, so nothing is ever sent to them.

## Things to try

1. **Schemes.** Sign in as Gupta. Add Glucose biscuit 75 g, set it to 10 cases, and open the cart to see 1 case free. Detergent powder 1 kg gets 3% off at 5 cases.

2. **Credit hold.** Sign in as Sharma and order 2 cases of Detergent powder 1 kg. The cart warns you, and the order goes on hold. Sign in as the desk to release or reject it.

3. **AI capture from the client's message.** As the desk, open **Messages**, then Gupta Kirana. It holds the client's sample message. Tea leaf 250 g is out of stock, so that line is left out.

4. **Unclear units are asked, not guessed.** Open Sharma's message, "biscuit 5, chai 100 wala 2 dabba, surf 500 3 peti". **Confirm order** stays off until a person has decided each line.

5. **It learns.** Choose **Add a WhatsApp message**, pick any shop and send `neela packet wala 3 peti`. It comes back low confidence. Under **None of these?** pick an item and confirm. Send the same words for the same shop again: the line now matches with high confidence, marked "Learned from a past correction". Other shops are not affected.

Then open **Tally export** to create the XML file, and **Van lists** and **No recent orders** for the rest of the desk.
