import { handleRenderRequest } from "../../src/http";
import type { RenderEnv } from "../../src/env";

export const config = {
    runtime: "nodejs",
    api: {
        bodyParser: false,
    },
};

export default function handler(request: Request): Promise<Response> {
    return handleRenderRequest({
        request,
        env: process.env as RenderEnv,
    });
}
