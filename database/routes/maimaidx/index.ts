import { Elysia } from "elysia";
import { listMusic } from "./list";
import { getRecords, uploadRecords, getB50 } from "./records";

export function maimaidx(app: Elysia | any) {
    return app
        .get("/list/music", listMusic)
        .get("/records", getRecords)
        .post("/records", uploadRecords)
        .get("/records/b50", getB50);
}
