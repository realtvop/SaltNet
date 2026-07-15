import { handleRenderRequest } from "../../render-service/src/http.js";
import type { RenderEnv } from "../../render-service/src/env.js";

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
