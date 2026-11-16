# AWS Free Tier deployment files

Companion files for `docs/AWS-FREE-TIER-DEPLOYMENT.md`. Read the guide first.

| File                        | Purpose                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `setup-ec2.sh`              | One-time bootstrap: installs Node 22 / nginx / PM2, clones, builds, configures, starts. Run as `ec2-user`. |
| `nginx-cricket.conf`        | nginx site: serves `frontend/dist` and proxies `/api/v1/*` to the services. |
| `ecosystem.config.js`       | PM2 definitions for auth-service, player-service, team-service.       |
| `redeploy.sh`               | Update after code changes: pull → rebuild → restart → reload nginx.   |
| `env-examples/*.env.example`| Templates showing exactly what each service's `.env` must contain.    |

Quick start (on your laptop, after launching the EC2 instance):

```bash
scp -i cricket-key.pem setup-ec2.sh nginx-cricket.conf ecosystem.config.js redeploy.sh \
  ec2-user@<PUBLIC_IP>:~/
ssh -i cricket-key.pem ec2-user@<PUBLIC_IP>
bash setup-ec2.sh
```
