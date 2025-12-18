import { Elysia } from "elysia";
import { listMusic } from "./list";
import { getRecords, uploadRecords } from "./records";

export function maimaidx(app: Elysia | any) {
    return app
        .get("/list/music", listMusic)
        .get("/records", getRecords)
        .post("/records", uploadRecords);
}
