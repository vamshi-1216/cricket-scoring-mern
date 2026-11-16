# Deploy Cricket Scoring System on AWS Free Tier — Step by Step

This guide deploys your **frontend**, **auth-service**, **player-service**, and **team-service**
onto a single AWS EC2 free-tier instance, using **MongoDB Atlas M0** (free forever) as the
database, **nginx** as the web server / reverse proxy, and **PM2** to keep the Node services
running.

Everything below is copy-pasteable. The heavy lifting is automated in
[`deploy/aws/setup-ec2.sh`](../deploy/aws/setup-ec2.sh) — read the guide once before running it.

---

## 1. What you are deploying

| Component       | Runs as        | Port  | Notes                                                        |
| --------------- | -------------- | ----- | ------------------------------------------------------------ |
| Frontend (React build) | nginx static files | 80  | Built by Vite on the server                                   |
| auth-service    | PM2 process    | 4001  | JWT, Google sign-in, MSG91, email (SMTP optional)             |
| player-service  | PM2 process    | 4002  | Player CRUD                                                   |
| team-service    | PM2 process    | 4004  | Team CRUD; calls player-service on 4002                       |
| MongoDB         | Atlas M0 cloud | —     | 512 MB free cluster, one per Atlas account                    |

nginx fronts everything: it serves the React build and proxies
`/api/v1/auth` → 4001, `/api/v1/players` → 4002, `/api/v1/teams` → 4004.
Because the browser only ever talks to nginx on port 80, the API calls are
same-origin and you never hit CORS problems in production.

```
Browser
   │  HTTP (port 80)
   ▼
EC2 t3.micro ── nginx ── /api/v1/auth    ──► auth-service    (localhost:4001)
              │      ├── /api/v1/players ──► player-service  (localhost:4002)
              │      ├── /api/v1/teams   ──► team-service    (localhost:4004)
              │      └── /               ──► frontend/dist   (React build)
              │
              └──── all three services ──► MongoDB Atlas M0 (mongodb+srv://…)
```

Not included here: `match-service` (4003), `scoring-service` (4005), `stats-service`, and Kafka.
The frontend's Matches/Scoring pages need those services; the same pattern in
`deploy/aws/` extends to them (nginx lines are pre-commented in the config).

## 2. Cost: how this stays free

- **EC2 t3.micro** — 750 hours/month free for 12 months (new accounts). Roughly one small
  instance running 24/7.
- **MongoDB Atlas M0** — free forever, 512 MB, no card required.
- **EBS root volume** — keep it at the default 8–30 GB gp3 (30 GB/month is free-tier eligible).
- **nginx, PM2, Let's Encrypt cert** — free.

Watch-outs (small but real):

- AWS charges ~$0.005/hour (~$3.70/month) for any **public IPv4 address** in use, even on
  free-tier instances (IPv6 is free). If you terminate the instance when done, there's nothing
  to pay.
- Outbound data transfer beyond the free allotment is charged; this app uses almost nothing.
- Do **not** attach an Application Load Balancer or use NAT gateways — neither is free.

## 3. Prerequisites

1. An AWS account (free tier). Have a payment method on file — EC2 requires it even when free.
2. A terminal with `ssh` and `scp` (Git Bash / WSL / macOS / Linux).
3. The project on your machine (this repo).
4. ~30 minutes.
5. **Optional but recommended:** a domain name (for HTTPS in step 8). You can do the whole
   deploy with just the EC2 public IP and add HTTPS later.

## 4. Step 1 — Create the secrets locally

You need two random secrets. Generate them once and reuse them in step 6:

```bash
# on your laptop, in any terminal
openssl rand -hex 32   # JWT_SECRET          (must be ≥ 32 chars)
openssl rand -hex 32   # INTERNAL_SERVICE_SECRET (must be ≥ 32 chars)
```

Also have ready:

- Your **Google OAuth Client ID** (the one already in `frontend/.env`).
- Your **MSG91 auth key + widget id + token auth** (also in `frontend/.env`).
- SMTP credentials — only if you want email verification/password-reset emails. Optional;
  leave blank to skip.

## 5. Step 2 — Create the free MongoDB database (Atlas M0)

1. Go to https://www.mongodb.com/atlas and sign up / log in (free).
2. **Create an organization / project** (any name, e.g. `cricket`).
3. Click **+ CREATE DATABASE** → choose **M0 FREE** tier → pick the region closest to you →
   name the cluster (e.g. `Cluster0`) → **Create Cluster**. Takes ~1 minute.
4. In the cluster, open **Database Access** → **Add New Database User**:
   - Username: e.g. `cricket_app`
   - Password: generate/store it somewhere safe
   - Permissions: `Atlas admin` (simplest for a project) → **Create user**
5. Open **Network Access** → **Add IP Address** → choose **Allow Access from Anywhere**
   (`0.0.0.0/0`) → confirm. (Tighter: add only your EC2 public IP later.)
6. Click **Connect** → **Drivers** → copy the connection string. It looks like:
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   Replace `<password>` with the real password (URL-encode it if it contains special chars).

   **Important:** each service uses its own database name. The setup script appends the name
   for you, so copy the string **without** a trailing database name:
   `mongodb+srv://cricket_app:pass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

## 6. Step 3 — Launch the EC2 instance

In the AWS console → **EC2** → **Instances** → **Launch instances**:

1. **Name**: `cricket-scoring`
2. **AMI**: *Amazon Linux 2023 AMI* (free tier eligible)
3. **Instance type**: `t3.micro` (free tier eligible; `t2.micro` also works)
4. **Key pair (login)**: create a new pair, e.g. `cricket-key`, download the `.pem` file,
   then `chmod 400 cricket-key.pem` (Linux/Mac; on Windows use Git Bash or PuTTY/SSH client).
5. **Network settings** → Edit → create a security group:
   - **SSH** port 22 → *My IP* (restrictive; safer)
   - **HTTP** port 80 → *Anywhere-IPv4* (`0.0.0.0/0`)
   - **HTTPS** port 443 → *Anywhere-IPv4* (`0.0.0.0/0`)
6. **Configure storage**: leave the default 8–30 GB gp3 (within free tier).
7. **Launch instance**. Wait for status checks to pass (2/2).
8. Note the **Public IPv4 address** (and IPv6 if shown). You'll use it as `<PUBLIC_IP>` below.

Connect once to prove it works:

```bash
ssh -i cricket-key.pem ec2-user@<PUBLIC_IP>
# type "yes" to the fingerprint, then exit
exit
```

## 7. Step 4 — Upload the deploy files

From your laptop, in the repo root (`cricket-scoring-mern`):

```bash
scp -i cricket-key.pem \
  deploy/aws/setup-ec2.sh \
  deploy/aws/nginx-cricket.conf \
  deploy/aws/ecosystem.config.js \
  deploy/aws/redeploy.sh \
  ec2-user@<PUBLIC_IP>:~/
```

## 8. Step 5 — Run the setup script (does everything in one pass)

```bash
ssh -i cricket-key.pem ec2-user@<PUBLIC_IP>
bash setup-ec2.sh
```

The script (idempotent-ish, ~10–15 min) will:

1. Install nginx, git, build tools, and Node.js 22; add a 2 GB swap file (protects the 1 GB
   instance during the frontend build).
2. Clone the repo into `/home/ec2-user/cricket`.
3. Ask you for the values it cannot guess (shown below), then write the `.env` files on the
   server and a `frontend/.env.production`.
4. Install dependencies, build the frontend (`vite build`), and start all three services
   with PM2.
5. Install the nginx site config (static hosting + API proxies), open the firewall, and
   enable PM2/nginx on boot.

Prompts and what to answer:

| Prompt                                             | Example answer                                         |
| -------------------------------------------------- | ------------------------------------------------------ |
| Public URL of the site (http/https, no trailing /) | `http://203.0.113.10` or `https://cricket.example.com` |
| MongoDB connection string (from step 5)            | `mongodb+srv://cricket_app:pass@cluster0.xxx…`         |
| JWT_SECRET (blank = generate)                      | paste step-4 secret or press Enter                     |
| INTERNAL_SERVICE_SECRET (blank = generate)         | same                                                   |
| Google Client ID                                   | the one in your `frontend/.env`                        |
| MSG91 auth key / widget id / token auth            | the ones in your `frontend/.env`                       |
| EMAIL user / app password / from (optional)        | leave blank unless you want email flows                |

When it finishes you'll see the health-check output and the public URL.

## 9. Step 6 — Verify it works

```bash
# on the server:
curl -s http://localhost/api/v1/auth        # JSON from auth service
curl -s http://localhost/api/v1/players     # JSON from player service
curl -s http://localhost/api/v1/teams       # JSON from team service
curl -s http://localhost/ | head            # your React app's HTML
pm2 status                                  # all 3 services "online"
```

In a browser, open `http://<PUBLIC_IP>` — the app loads. Create an account and log in;
then check Atlas: **Collections** → you should see `cricket_auth.users`,
`cricket_players.players`, `cricket_teams.teams` (databases are created on first write).

If the browser works but the API curls fail (or vice versa), see the troubleshooting table.

## 10. Step 7 — HTTPS (recommended; needed for Google sign-in + Secure cookies)

Two facts drive this step:

- The auth service sets `secure: true` on its cookies when `NODE_ENV=production`, so
  **over plain HTTP browsers will not send the session cookie back** — login appears to
  work but you're immediately logged out on the next request.
- Google requires **https** origins for OAuth on anything but `localhost`.

**If you have a domain (recommended):**

1. Point the domain's A record at the EC2 public IP (your DNS provider's console).
2. On the server:

   ```bash
   sudo dnf install -y certbot python3-certbot-nginx   # if not found, add EPEL first:
   # sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm
   sudo certbot --nginx -d cricket.example.com
   ```

   Certbot rewrites nginx to serve HTTPS and redirects HTTP→HTTPS. Renewal is automatic
   (`sudo certbot renew --dry-run` to test; a systemd timer is installed).

**If you have no domain (quick functional test):** set `NODE_ENV=development` in the three
service `.env` files on the server and restart (`pm2 restart all`) — cookies then work over
HTTP, at the cost of the production hardening. For a real deployment, use the domain + HTTPS
path above. (Alternatively I can patch the cookie code to read a `COOKIE_SECURE` env flag —
say the word.)

Also update `FRONTEND_ORIGIN` in each service `.env` to the exact public origin
(`https://cricket.example.com`, no trailing slash) if it changed after adding HTTPS, then
`pm2 restart all`.

## 11. Step 8 — Google Sign-In and MSG91

- Google Cloud console → **APIs & Services → Credentials** → your OAuth client →
  **Authorized JavaScript origins**: add `http://<PUBLIC_IP>` and/or
  `https://cricket.example.com`. Save (takes a minute to propagate).
- The same `VITE_GOOGLE_CLIENT_ID` was baked into the frontend build by the setup script
  and the same ID is in `services/auth-service/.env` — keep them identical.
- MSG91: the widget id/token are frontend-only; the `MSG91_AUTH_KEY` is the backend one.
  Phone verification must be enabled in your MSG91 account for the number's country.

## 12. Everyday operations

```bash
ssh -i cricket-key.pem ec2-user@<PUBLIC_IP>

pm2 status                # process list
pm2 logs auth-service     # follow one service's logs
pm2 restart all           # restart everything
sudo nginx -t && sudo systemctl reload nginx

# Deploy new code (from your laptop):
scp -i cricket-key.pem deploy/aws/redeploy.sh ec2-user@<PUBLIC_IP>:~/
# then on the server:
bash redeploy.sh          # git pull, reinstall, rebuild frontend, restart, reload nginx
```

`redeploy.sh` keeps everything in sync. If you changed `.env` files manually, restart the
affected service: `pm2 restart auth-service`.

## 13. Troubleshooting

| Symptom                                  | Likely cause / fix |
| ---------------------------------------- | ------------------ |
| `curl localhost/api/v1/auth` → 502       | Service down. `pm2 status`, `pm2 logs auth-service`. Most common: bad `MONGODB_URI` or Atlas IP not allowlisted, or a `.env` value that failed Zod validation (the log names the field). |
| Browser blank page                       | nginx root wrong / build failed. `ls /home/ec2-user/cricket/frontend/dist`; `sudo journalctl -u nginx -n 50`. |
| Login succeeds but immediately logged out | Secure cookie over HTTP — do step 7 (HTTPS) or set `NODE_ENV=development`. |
| CORS error in browser console            | `FRONTEND_ORIGIN` in the service `.env` doesn't exactly match the browser's origin (include `http(s)://`, no trailing slash). |
| Google button does nothing / error       | Client ID mismatch, or origin not in Google's Authorized JavaScript origins (step 8). |
| `bcrypt` build errors during install     | Build tools missing — the script installs `gcc-c++ make python3`; re-run it. |
| Server unreachable entirely              | Security group missing HTTP 80 rule; or instance stopped. Check EC2 console. |
| Out of memory during `vite build`        | Swap missing — the script adds 2 GB; if you skipped it, `sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. |
| PM2 processes gone after reboot          | `pm2 save` then run the `pm2 startup` command it prints (with sudo). |

## 14. Stop / tear down (so you never get billed)

- Pause: EC2 console → **Instance state → Stop instance** (no instance-hours billed; EBS
  storage still billed at pennies; public IPv4 charge stops with the instance).
- Full delete: **Terminate instance**; Atlas → **Delete Cluster**; delete the key pair.
- If you attached an Elastic IP, release it (unattached EIPs are billed).

## 15. Files that make this work

```
deploy/aws/
├── setup-ec2.sh          # one-time bootstrap: installs everything, builds, starts
├── nginx-cricket.conf    # nginx site: static hosting + /api proxy rules
├── ecosystem.config.js   # PM2: the three services, auto-restart, boot survival
├── redeploy.sh           # pull → rebuild → restart
└── env-examples/         # .env templates per service + frontend
docs/
└── AWS-FREE-TIER-DEPLOYMENT.md   # this guide
```

Happy scoring. If any step misbehaves, paste the exact output of
`pm2 logs <service> --lines 30` and I'll debug it with you.
