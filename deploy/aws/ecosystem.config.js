// PM2 process file for the three deployed services.
// Started by setup-ec2.sh:  pm2 start deploy/aws/ecosystem.config.js
// Each service loads its own .env from its directory via dotenv (auth-service
// additionally supports --env-file; dotenv is enough here).

const APP_DIR = "/home/ec2-user/cricket";

module.exports = {
  apps: [
    {
      name: "auth-service",
      script: "src/server.js",
      interpreter: "node",
      cwd: `${APP_DIR}/services/auth-service`,
      env: { NODE_ENV: "production" },
    },
    {
      name: "player-service",
      script: "src/server.js",
      interpreter: "node",
      cwd: `${APP_DIR}/services/player-service`,
      env: { NODE_ENV: "production" },
    },
    {
      name: "team-service",
      script: "src/server.js",
      interpreter: "node",
      cwd: `${APP_DIR}/services/team-service`,
      env: { NODE_ENV: "production" },
    },
    // When you deploy match-service (4003) / scoring-service (4005), add the
    // same block here plus the matching nginx location.
  ],
};
