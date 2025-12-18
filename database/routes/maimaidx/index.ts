import { Elysia } from "elysia";
import { listMusic } from "./list";

export function maimaidx(app: Elysia | any) {
    return app
        .get("/list/music", listMusic);
}
