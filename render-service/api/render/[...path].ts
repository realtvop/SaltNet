import { handleRenderRequest } from "../../src/http.js";
import type { RenderEnv } from "../../src/env.js";

export const config = {
    runtime: "nodejs",
    api: {
        bodyParser: false,
    },
};

export default {
    fetch(request: Request): Promise<Response> {
        return handleRenderRequest({
            request,
            env: process.env as RenderEnv,
        });
    },
};
