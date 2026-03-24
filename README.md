# Amazon Seller Central India → Dashboard (Detailed Starter)

This gives you a **working baseline** to connect your dashboard with Amazon Seller Central India and show **basic sales totals** first.

## Important security note

If your **Client Secret** was exposed (like in a shared screenshot), rotate/regenerate it immediately in Seller Central before going live.

---

## 1) Install

```bash
npm install
```

## 2) Setup env

```bash
cp .env.example .env
```

Fill these carefully:

- `AMAZON_SELLER_APP_ID`
  - from your Seller Central app registration (looks like `amzn1.sellerapps.app...`)
- `LWA_CLIENT_ID` and `LWA_CLIENT_SECRET`
  - from **Login with Amazon Security Profile** (the page you shared)
- `OAUTH_REDIRECT_URI`
  - must exactly match URI configured in that Security Profile
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  - IAM credentials for SP-API request signing
- `MARKETPLACE_ID`
  - India default is `A21TJRUUN4KGV`

---

## 3) Run server

```bash
npm start
```

Server starts at `http://localhost:3000`.

---

## 4) Complete OAuth once (to get refresh token)

### Step A — generate consent URL

Open:

```bash
curl "http://localhost:3000/auth/amazon/url"
```

Copy `consentUrl` from response and open it in browser.

### Step B — seller approves app

After approval, Amazon redirects to:

`/auth/amazon/callback?spapi_oauth_code=...&selling_partner_id=...`

This project exchanges that `spapi_oauth_code` for tokens and returns JSON including `refresh_token`.

### Step C — save refresh token

Take returned `refresh_token` and put it in:

`LWA_REFRESH_TOKEN=...`

in your `.env`.

---

## 5) Fetch basic sales for dashboard

```bash
curl "http://localhost:3000/api/sales/basic?days=7"
```

Response contains:

- `orderCount`
- `totalSales`
- `currency`
- `period`
- `orders` (raw list for next features)

---

## API Endpoints

- `GET /health`
- `GET /auth/amazon/url`
- `GET /auth/amazon/callback`
- `GET /api/sales/basic?days=7` (days: 1 to 30)

---

## Next features we can add

- Daily sales trend for graph
- Top products by revenue/units
- Returns + refunds impact
- Fees + profit estimation
- Scheduled sync to your DB (instead of live fetch every request)
