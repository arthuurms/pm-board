import { getPublicOrigin, protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";

export async function GET(req: Request) {
  const origin = getPublicOrigin(req);
  return protectedResourceHandler({ authServerUrls: [origin] })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
