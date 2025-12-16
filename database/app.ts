import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { user, maimaidx } from "./routes";

export const app = new Elysia()
    .use(cors())
    .group("/v0/user", user)
    .group("/v0/maimaidx", maimaidx);
