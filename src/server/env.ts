import { config } from "dotenv";

if (process.argv.includes("--prod")) {
  Object.assign(process.env, { NODE_ENV: "production" });
}
config();
