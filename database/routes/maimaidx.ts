import { Elysia } from "elysia";

export function maimaidx(app: Elysia | any) {
    return app.get("/", () => "hi");
}
