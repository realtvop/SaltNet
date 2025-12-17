import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { user, maimaidx } from "./routes";

export const app = new Elysia()
    .use(cors())
    .group("/api/v0", app =>
        app
            .group("/user", user)
            .group("/maimaidx", maimaidx)
    );
