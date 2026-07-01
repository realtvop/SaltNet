import { handleRenderRequest } from "./http";
import type { RenderEnv } from "./env";

export default {
    fetch(request: Request, env: RenderEnv): Promise<Response> {
        return handleRenderRequest({ request, env });
    },
};
